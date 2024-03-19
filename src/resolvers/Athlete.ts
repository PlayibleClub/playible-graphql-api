import { AthleteStatType, SportType } from './../utils/types';
import { Contract } from 'near-api-js';

import {
  Arg,
  Authorized,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql';
import { AthleteSortOptions, GetAthletesArgs } from '../args/AthleteArgs';
import { setup, changeAthleteMetadataSetup } from '../near-api';
import axios, { AxiosResponse } from 'axios';
import { S3 } from 'aws-sdk';
import { Athlete } from '../entities/Athlete';
import { AthleteStat } from '../entities/AthleteStat';
import { AppDataSource } from '../utils/db';
import { Game } from '../entities/Game';
import { GameTeam } from '../entities/GameTeam';
import { GameTeamAthlete } from '../entities/GameTeamAthlete';

import { Team } from '../entities/Team';
import fs from 'fs';
import path from 'path';
import { In, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import {
  NFL_ATHLETE_IDS,
  NFL_ATHLETE_PROMO_IDS,
  NBA_ATHLETE_IDS,
  NBA_ATHLETE_PROMO_IDS,
  MLB_ATHLETE_IDS,
  MLB_ATHLETE_PROMO_IDS,
  TEST_ATHLETE_IDS,
} from './../utils/athlete-ids';
import { EntrySummaryResult } from './../utils/types';
import moment from 'moment';
import { ethers } from 'ethers';
import promoOpenPackStorageABI from './../utils/polygon-contract-abis/promo_open_pack_storage.json';
import regularOpenPackStorageABI from './../utils/polygon-contract-abis/regular_open_pack_storage.json';
import regularOpenPackStorageNbaABI from './../utils/polygon-contract-abis/regular_open_pack_storage_nba.json';
import { IPFSMetadata, ChainType } from './../utils/types';
@ObjectType()
class Distribution {
  @Field()
  rank: number;
  @Field()
  percentage: number;
}

@ObjectType()
class TestResponse {
  @Field()
  gameId: string;
  @Field()
  prize: number;
  @Field(() => [Distribution])
  distribution: Distribution[];
}

@ObjectType()
class UserAthleteResponse {
  @Field()
  tokenId: string;
  @Field(() => Athlete)
  athlete: Athlete;
}

const chunkify = (a: any[], n: number, balanced: boolean) => {
  if (n < 2) return [a];

  var len = a.length,
    out = [],
    i = 0,
    size;

  if (len % n === 0) {
    size = Math.floor(len / n);
    while (i < len) {
      out.push(a.slice(i, (i += size)));
    }
  } else if (balanced) {
    while (i < len) {
      size = Math.ceil((len - i) / n--);
      out.push(a.slice(i, (i += size)));
    }
  } else {
    n--;
    size = Math.floor(len / n);
    if (len % size === 0) size--;
    while (i < size * n) {
      out.push(a.slice(i, (i += size)));
    }
    out.push(a.slice(size * n));
  }

  return out;
};

@Resolver()
export class AthleteResolver {
  @Query(() => Athlete)
  async getAthleteById(
    @Arg('id') id: number,
    @Arg('from', { nullable: true }) from?: Date,
    @Arg('to', { nullable: true }) to?: Date,
    @Arg('season', { nullable: true }) season?: string
  ): Promise<Athlete> {
    const athlete = await Athlete.findOneOrFail({
      where: { id },
      relations: {
        stats: { opponent: true },
        team: true,
      },
    });

    if (season) {
      athlete.stats = athlete.stats.filter((stat) => stat.season === season);
    }

    if (from) {
      //athlete.stats = athlete.stats.filter((stat) => stat.gameDate && stat.gameDate.toISOString() >= from.toISOString())
      athlete.stats = athlete.stats.filter(
        (stat) =>
          stat.gameDate && moment(stat.gameDate).unix() >= moment(from).unix()
      );
    }

    if (to) {
      athlete.stats = athlete.stats.filter(
        (stat) =>
          stat.gameDate && moment(stat.gameDate).unix() <= moment(to).unix()
      );
    }

    return athlete;
  }

  @Query(() => Athlete)
  async getAthleteByApiId(
    @Arg('id') apiId: number,
    @Arg('from', { nullable: true }) from?: Date,
    @Arg('to', { nullable: true }) to?: Date,
    @Arg('season', { nullable: true }) season?: string
  ): Promise<Athlete> {
    const athlete = await Athlete.findOneOrFail({
      where: { apiId: apiId },
      relations: {
        stats: { opponent: true },
        team: true,
      },
    });

    if (season) {
      athlete.stats = athlete.stats.filter((stat) => stat.season === season);
    }

    if (from) {
      //athlete.stats = athlete.stats.filter((stat) => stat.gameDate && stat.gameDate.toISOString() >= from.toISOString())
      athlete.stats = athlete.stats.filter(
        (stat) =>
          stat.gameDate && moment(stat.gameDate).unix() >= moment(from).unix()
      );
    }

    if (to) {
      athlete.stats = athlete.stats.filter(
        (stat) =>
          stat.gameDate && moment(stat.gameDate).unix() <= moment(to).unix()
      );
    }

    return athlete;
  }
  @Query(() => [GameTeamAthlete])
  async getEntrySummaryAthletes(
    @Arg('teamName') teamName: string,
    @Arg('address') address: string,
    @Arg('gameId') gameId: number,
    @Arg('chain') chain: ChainType,
    @Arg('sport') sport: SportType
  ): Promise<GameTeamAthlete[]> {
    let returnAthletes = await GameTeamAthlete.find({
      where: {
        gameTeam: {
          name: teamName,
          wallet_address: address,
          game: {
            gameId: gameId,
            chain: chain,
            sport: sport,
          },
        },
        // athlete: {
        //   stats: {
        //     gameDate: Between(from, to),
        //   },
        // },
      },
      relations: {
        gameTeam: {
          game: true,
        },
        athlete: {
          team: true,
        },
      },
    });

    return returnAthletes;
  }

  @Query(() => [EntrySummaryResult])
  async getEntrySummaryAthletesWithScore(
    @Arg('teamName') teamName: string,
    @Arg('address') address: string,
    @Arg('gameId') gameId: number,
    @Arg('chain') chain: ChainType,
    @Arg('sport') sport: SportType,
    @Arg('startTime') startTime: Date,
    @Arg('endTime') endTime: Date
  ): Promise<EntrySummaryResult[]> {
    const returnAthletes = await AppDataSource.getRepository(GameTeamAthlete)
      .createQueryBuilder('gta')
      .groupBy('gta.id')
      .addGroupBy('a.apiId')
      .addGroupBy('a.firstName')
      .addGroupBy('a.lastName')
      .select([
        'gta.id as game_team_athlete_id',
        'a.apiId as athlete_id',
        'a.firstName as first_name',
        'a.lastName as last_name',
        'SUM(as2.fantasyScore) as total',
      ])
      .innerJoin(GameTeam, 'gt', 'gt.id = gta.gameTeamId')
      .innerJoin(Game, 'g', 'g.id = gt.gameId')
      .innerJoin(Athlete, 'a', 'gta.athleteId = a.id')
      .innerJoin(AthleteStat, 'as2', 'as2.athleteId = a.id')
      .where('g.gameId = :gameId', { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('gt.name = :teamName', { teamName: teamName })
      .andWhere('gt.wallet_address = :address', { address: address })
      .andWhere('g.chain = :chain', { chain: chain })
      .andWhere('as2.gameDate >= :startTime', { startTime: startTime })
      .andWhere('as2.gameDate <= :endTime', { endTime: endTime })
      .getRawMany();
    return returnAthletes;
  }
  @Query(() => [Athlete])
  async getAthleteByIds(
    @Arg('ids', () => [Number]) ids: number[]
  ): Promise<Athlete[]> {
    return await Athlete.find({
      where: { id: In(ids) },
      relations: {
        stats: true,
        team: true,
      },
    });
  }

  @Query(() => [Athlete])
  async getAthletes(
    @Arg('args', { nullable: true })
    { sort, filter, pagination }: GetAthletesArgs
  ): Promise<Athlete[]> {
    let args: any = {};
    let order: any = {
      id: 'asc',
    };

    switch (sort) {
      case AthleteSortOptions.ID:
        order = {
          id: 'asc',
        };
        break;
      case AthleteSortOptions.SCORE:
        order = {
          stats: {
            fantasyScore: 'desc',
          },
        };
        break;
    }

    if (pagination) {
      args['take'] = pagination.limit;
      args['skip'] = pagination.offset;
    }

    let athletes = await Athlete.find({
      ...args,
      where: filter?.sport
        ? {
            team: { sport: filter?.sport },
            stats: {
              ...(sort === AthleteSortOptions.SCORE && {
                fantasyScore: MoreThanOrEqual(0),
              }),
              ...(filter?.statType && { type: filter?.statType }),
            },
          }
        : {
            stats: {
              fantasyScore: MoreThanOrEqual(0),
              ...(filter?.statType && { type: filter?.statType }),
            },
          },
      relations: {
        stats: { opponent: true },
        team: true,
      },
      order: order,
    });

    return athletes;
  }

  @Authorized('ADMIN')
  @Mutation(() => Number)
  async addAthletesToFilebaseS3IPFSBucket(
    @Arg('sportType') sportType: SportType,
    @Arg('isPromo') isPromo: boolean = false
  ): Promise<Number> {
    let athleteIds: number[] = [];
    const nftImages = ['nftImage'];
    console.log(isPromo);
    //setup AWS S3 bucket
    const s3Filebase = new S3({
      apiVersion: '2006-03-01',
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      accessKeyId: process.env.FILEBUCKET_ACCESS_KEY_ID,
      secretAccessKey: process.env.FILEBUCKET_SECRET_ACCESS_KEY,
      s3ForcePathStyle: true,
    });

    switch (sportType) {
      case SportType.TEST:
        athleteIds = TEST_ATHLETE_IDS;
        break;
      case SportType.NFL:
        athleteIds = NFL_ATHLETE_IDS;
        break;
      case SportType.NFL_PROMO:
        athleteIds = NFL_ATHLETE_PROMO_IDS;
        break;
      case SportType.NBA:
        athleteIds = NBA_ATHLETE_IDS;
        break;
      case SportType.NBA_PROMO:
        athleteIds = NBA_ATHLETE_PROMO_IDS;
        break;
    }

    const athletes = await Athlete.find({
      where: {
        apiId: In(athleteIds),
      },
    });
    console.log(athletes.length);

    for (let athlete of athletes) {
      for (let imageType of nftImages) {
        let fileType = '';
        let response: AxiosResponse;
        switch (imageType) {
          case 'nftImageLocked':
            response = await axios.get(athlete.nftImageLocked ?? 'default', {
              responseType: 'arraybuffer',
            });
            fileType = 'SB';
            break;
          case 'nftImagePromo':
            response = await axios.get(athlete.nftImagePromo ?? 'default', {
              responseType: 'arraybuffer',
            });
            fileType = 'P';
            break;
          case 'nftImage':
          default:
            response = await axios.get(athlete.nftImage ?? 'default', {
              responseType: 'arraybuffer',
            });
            fileType = 'R';
            break;
        }
        const data = Buffer.from(response.data, 'utf8');
        const fileBaseParams = {
          Bucket: process.env.FILEBUCKET_BUCKET_NAME ?? '',
          ContentType: 'image/svg+xml',
          Key: `${fileType}_${athlete.apiId}`,
          ACL: 'public-read',
          Body: data,
          Metadata: {
            // firstName: athlete.firstName,
            // lastName: athlete.lastName,
            apiId: athlete.apiId.toString(),
          },
        };
        //await new Promise((resolve) => setTimeout(resolve, 2000));
        const request = s3Filebase.putObject(fileBaseParams);
        request.on('httpHeaders', async (statusCode, headers) => {
          let test = statusCode;
          switch (imageType) {
            case 'nftImageLocked':
              athlete.soulBoundCid = headers['x-amz-meta-cid'];
              athlete.tokenSoulboundURI = `https://ipfs.filebase.io/ipfs/${headers['x-amz-meta-cid']}`;
              break;
            case 'nftImagePromo':
              athlete.promoCid = headers['x-amz-meta-cid'];
              athlete.tokenPromoURI = `https://ipfs.filebase.io/ipfs/${headers['x-amz-meta-cid']}`;
              break;
            case 'nftImage':
              athlete.cid = headers['x-amz-meta-cid'];
              athlete.tokenURI = `https://ipfs.filebase.io/ipfs/${headers['x-amz-meta-cid']}`;
              break;
          }
          await Athlete.save(athlete);
        });
        request.on('error', (error) => {
          console.log('Error on filebase bucket request');
          console.log(`Athlete who errored : ${athlete.apiId}`);
          console.log(error);
        });
        request.send();
      }
    }
    console.log('Finish add to filebase');
    return athletes.length;
  }

  @Authorized('ADMIN')
  @Mutation(() => [Number])
  async getAthleteApiIdFromPolygonOpenPack(
    @Arg('contractAddress') contractAddress: string,
    @Arg('sportType') sportType: SportType,
    @Arg('athleteLength') athleteLength: number
  ): Promise<Number[]> {
    let apiIdFromContract = [];
    let contractABI: string = '';
    console.log('Start getAthleteApiIdFromPolygonOpenPack');
    switch (sportType) {
      case SportType.NFL:
        athleteLength = NFL_ATHLETE_IDS.length;
        contractABI = JSON.stringify(regularOpenPackStorageABI);
        break;
      case SportType.NBA:
        athleteLength = NBA_ATHLETE_IDS.length;
        contractABI = JSON.stringify(regularOpenPackStorageNbaABI);
        break;
    }
    const network = 'matic';
    const provider = new ethers.AlchemyProvider(
      network,
      //process.env.ALCHEMY_ZKEVM_TESTNET_API_KEY
      process.env.ALCHEMY_POLYGON_API_KEY
    );
    const signer = new ethers.Wallet(
      process.env.METAMASK_PRIVATE_KEY ?? '',
      provider
    );
    const contract = new ethers.Contract(contractAddress, contractABI, signer);
    for (let i = 0; i < athleteLength; i++) {
      const result = await contract.addedAthletes(i, {
        from: process.env.METAMASK_WALLET_ADDRESS,
      });
      console.log(Number(result[2]));
      apiIdFromContract.push(Number(result[2]));
      if (i + 1 === athleteLength) {
        console.log('getAthleteApiIdFromPolygonOpenPack done');
        console.log(apiIdFromContract);
      }
    }
    console.log('getAthleteApiIdFromPolygonOpenPack Done');
    console.log(apiIdFromContract);
    return apiIdFromContract;
  }

  @Authorized('ADMIN')
  @Mutation(() => Number)
  async addStarterAthletesToOpenPackContractPolygon(
    @Arg('sportType') sportType: SportType,
    @Arg('isPromo') isPromo: boolean = false,
    @Arg('contractAddress') contractAddress: string
  ): Promise<Number> {
    let athleteIds: number[] = [];
    let contractABI: string = '';
    switch (sportType) {
      case SportType.NFL:
        athleteIds = NFL_ATHLETE_IDS;
        contractABI = JSON.stringify(regularOpenPackStorageABI);
        break;
      case SportType.NFL_PROMO:
        athleteIds = NFL_ATHLETE_PROMO_IDS;
        contractABI = JSON.stringify(promoOpenPackStorageABI);
        break;
      case SportType.NBA:
        athleteIds = NBA_ATHLETE_IDS;
        contractABI = JSON.stringify(regularOpenPackStorageNbaABI);
        break;
      case SportType.NBA_PROMO:
        athleteIds = NBA_ATHLETE_PROMO_IDS;
        contractABI = JSON.stringify(promoOpenPackStorageABI);
    }
    //const network = "maticmum"; // polygon testnet
    const network = 'maticmum'; // Polygon zkEVM Testnet ChainId
    try {
      const provider = new ethers.AlchemyProvider(
        network,
        //process.env.ALCHEMY_ZKEVM_TESTNET_API_KEY
        process.env.ALCHEMY_POLYGON_API_KEY
      );
      const signer = new ethers.Wallet(
        process.env.METAMASK_PRIVATE_KEY ?? '',
        provider
      );
      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );

      const athletes = (
        await Athlete.find({
          where: { apiId: In(athleteIds) },
          order: { id: 'ASC' },
          relations: { team: true },
        })
      ).map((athlete) => {
        if (isPromo) {
          const promoIpfs: IPFSMetadata = {
            name: `${athlete.firstName} ${athlete.lastName} Token`,
            description: 'Playible Athlete Promotional Token',
            image: athlete.tokenPromoURI,
            properties: {
              athleteId: athlete.id.toString(),
              symbol: athlete.apiId.toString(),
              name: `${athlete.firstName} ${athlete.lastName}`,
              team: athlete.team.key,
              position: athlete.position,
              release: '1',
            },
          };
          const soulboundIpfs: IPFSMetadata = {
            name: `${athlete.firstName} ${athlete.lastName} Token`,
            description: 'Playible Athlete Soulbound Token',
            image: athlete.tokenSoulboundURI,
            properties: {
              athleteId: athlete.id.toString(),
              symbol: athlete.apiId.toString(),
              name: `${athlete.firstName} ${athlete.lastName}`,
              team: athlete.team.key,
              position: athlete.position,
              release: '1',
            },
          };
          return {
            athleteId: athlete.id.toString(),
            soulboundTokenUri: JSON.stringify(soulboundIpfs),
            singleUseTokenUri: JSON.stringify(promoIpfs),
            symbol: athlete.apiId.toString(),
            name: `${athlete.firstName} ${athlete.lastName}`,
            team: athlete.team.key,
            position: athlete.position,
          };
        } else {
          const ipfs: IPFSMetadata = {
            name: `${athlete.firstName} ${athlete.lastName} Token`,
            description: 'Playible Athlete Token',
            image: athlete.tokenURI,
            properties: {
              athleteId: athlete.id.toString(),
              symbol: athlete.apiId.toString(),
              name: `${athlete.firstName} ${athlete.lastName}`,
              team: athlete.team.key,
              position: athlete.position,
              release: '1',
            },
          };
          return {
            athleteId: athlete.id.toString(),
            //tokenUri: athlete.tokenURI,
            tokenUri: JSON.stringify(ipfs),
            symbol: athlete.apiId.toString(),
            name: `${athlete.firstName} ${athlete.lastName}`,
            team: athlete.team.key,
            position: athlete.position,
          };
        }
      });

      const chunkifiedAthletes = chunkify(athletes, 33, false);
      console.log(chunkifiedAthletes.length);
      for (const chunk of chunkifiedAthletes) {
        console.log('Executing add athletes...');
        try {
          const receipt = await contract.executeAddAthletes(chunk, {
            from: process.env.METAMASK_WALLET_ADDRESS,
            gasPrice: 1500000000, //for testnet gas
          });
        } catch (e) {
          console.log(e);
        }

        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
      // await contract.executeAddAthletes(athletes, {
      //   from: process.env.METAMASK_WALLET_ADDRESS,
      //   gasPrice: 1500000000,
      //   //10000000000 10 gwei
      // });
      //console.log(JSON.stringify(athletes));
      return athletes.length;
    } catch (error) {
      console.log(error);
    }
    return 0;
  }
  @Authorized('ADMIN')
  @Mutation(() => Number)
  async addStarterAthletesToOpenPackContract(
    @Arg('sportType') sportType: SportType,
    @Arg('isPromo') isPromo: boolean = false
  ): Promise<Number> {
    let contractId;
    let athleteIds: number[] = [];

    switch (sportType) {
      case SportType.NFL:
        contractId = process.env.OPENPACK_NFL_ACCOUNT_ID;
        athleteIds = NFL_ATHLETE_IDS;
        break;
      case SportType.NFL_PROMO:
        contractId = process.env.OPENPACK_NFL_PROMO_ACCOUNT_ID;
        athleteIds = NFL_ATHLETE_PROMO_IDS;
        break;
      case SportType.NBA:
        contractId = process.env.OPENPACK_NBA_ACCOUNT_ID;
        athleteIds = NBA_ATHLETE_IDS;
        break;
      case SportType.NBA_PROMO:
        contractId = process.env.OPENPACK_NBA_PROMO_ACCOUNT_ID;
        athleteIds = NBA_ATHLETE_PROMO_IDS;
        break;
      case SportType.MLB:
        contractId = process.env.OPENPACK_MLB_ACCOUNT_ID; //add MLB athlete ids here
        athleteIds = MLB_ATHLETE_IDS;
        break;
      case SportType.MLB_PROMO:
        contractId = process.env.OPENPACK_MLB_PROMO_ACCOUNT_ID;
        athleteIds = MLB_ATHLETE_IDS;
        break;
      default:
        contractId = process.env.OPENPACK_NFL_ACCOUNT_ID; //add cricket athlete id/key here
        break;
    }

    const nearApi = await setup();
    const account = await nearApi.account(
      process.env.NEAR_MAIN_ACCOUNT_ID || ''
    );
    const contract: any = new Contract(account, contractId || '', {
      viewMethods: [],
      changeMethods: ['execute_add_athletes'],
    });

    const athleteTokens = (
      await Athlete.find({
        where: { apiId: In(athleteIds) },
        order: { id: 'ASC' },
        relations: { team: true },
      })
    ).map((athlete) => {
      if (isPromo) {
        return {
          athlete_id: athlete.id.toString(),
          soulbound_token_uri: athlete.nftImageLocked,
          single_use_token_uri: athlete.nftImagePromo,
          symbol: athlete.apiId.toString(),
          name: `${athlete.firstName} ${athlete.lastName}`,
          team: athlete.team.key,
          position: athlete.position,
        };
      } else {
        return {
          athlete_id: athlete.id.toString(),
          token_uri: athlete.nftImage,
          symbol: athlete.apiId.toString(),
          name: `${athlete.firstName} ${athlete.lastName}`,
          team: athlete.team.key,
          position: athlete.position,
        };
      }
    });

    const chunkifiedAthleteTokens = chunkify(athleteTokens, 10, false);

    for (const _athletesTokens of chunkifiedAthleteTokens) {
      await contract.execute_add_athletes(
        { pack_type: 'starter', athlete_tokens: _athletesTokens },
        '300000000000000'
      );
    }

    return athleteTokens.length;
  }

  @Mutation(() => Boolean)
  async updateMetadataOfNearAthlete(
    @Arg('sportType') sportType: SportType,
    @Arg('tokenId') tokenId: string
  ): Promise<Boolean> {
    //TODO: add switch case for different contracts
    let contractId;
    let accountId;
    console.log(`Start update of NEAR athlete metadata for athlete ${tokenId}`);
    switch (
      sportType //if it doesn't work, change to main sport account id
    ) {
      case SportType.NFL:
        accountId = process.env.NEAR_NFL_ACCOUNT_ID;
        contractId = process.env.NEAR_NFL_ATHLETE_ACCOUNT_ID;
        break;
      case SportType.NFL_PROMO:
        accountId = process.env.NEAR_NFL_ACCOUNT_ID;
        contractId = process.env.NEAR_NFL_ATHLETE_PROMO_ACCOUNT_ID;
        break;
      case SportType.NBA:
        accountId = process.env.NEAR_NBA_ACCOUNT_ID;
        contractId = process.env.NEAR_NBA_ATHLETE_ACCOUNT_ID;
        break;
      case SportType.NBA_PROMO:
        accountId = process.env.NEAR_NBA_ACCOUNT_ID;
        contractId = process.env.NEAR_NBA_ATHLETE_PROMO_ACCOUNT_ID;
        break;
      case SportType.MLB:
        accountId = process.env.NEAR_MLB_ACCOUNT_ID;
        contractId = process.env.NEAR_MLB_ATHLETE_ACCOUNT_ID;
        break;
      case SportType.MLB_PROMO:
        accountId = process.env.NEAR_MLB_ACCOUNT_ID;
        contractId = process.env.NEAR_MLB_ATHLETE_PROMO_ACCOUNT_ID;
    }
    const nearApi = await changeAthleteMetadataSetup(sportType);
    const account = await nearApi.account(accountId || '');
    const contract: any = new Contract(account, contractId || '', {
      viewMethods: ['get_team_and_position_of_token'],
      changeMethods: ['update_team_and_position_of_token'],
    });
    let apiId = '';
    let tempTokenId = tokenId;
    if (tokenId.includes('PR') || tokenId.includes('SB')) {
      tempTokenId = tokenId.split('_')[1];
    }
    apiId = tempTokenId.split('CR')[0];

    const athleteFromNear = await contract.get_team_and_position_of_token({
      token_id: tokenId,
    });
    console.log(athleteFromNear);
    const athlete = await Athlete.findOneOrFail({
      where: {
        apiId: Number(apiId),
      },
      relations: {
        team: true,
      },
    });
    let newPosition =
      athlete.position !== athleteFromNear.position ? athlete.position : '';
    let newTeam =
      athlete.team.key !== athleteFromNear.team ? athlete.team.key : '';

    // if (athleteFromNear) {
    //   newPosition = athlete.position !== tokenPosition ? athlete.position : '';
    // }
    // if (tokenTeam) {
    //   newTeam = athlete.team.key !== tokenTeam ? athlete.team.key : '';
    // }

    if (newPosition.length > 0 || newTeam.length > 0) {
      console.log(
        `Found wrong team or position for athlete apiId ${athlete.apiId} and tokenId ${tokenId}`
      );
      console.log({
        token_id: tokenId,
        team: newTeam,
        position: newPosition,
      });
      try {
        const success: boolean =
          await contract.update_team_and_position_of_token(
            {
              token_id: tokenId,
              team: newTeam !== '' ? newTeam : null,
              position: newPosition !== '' ? newPosition : null,
            },
            '300000000000000'
          );
        console.log(success);
        return success;
      } catch (error) {
        console.log(error);
        return false;
      }
    } else {
      //no changes will be made
      return false;
    }
  }
}
