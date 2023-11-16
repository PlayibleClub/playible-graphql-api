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
import moment from 'moment';
import { ethers } from 'ethers';
import promoOpenPackStorageABI from './../utils/polygon-contract-abis/promo_open_pack_storage.json';
import regularOpenPackStorageABI from './../utils/polygon-contract-abis/regular_open_pack_storage.json';
import { IPFSMetadata, ContractType } from './../utils/types';
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
    @Arg('chain') chain: ContractType,
    @Arg('from') from: Date,
    @Arg('to') to: Date
  ): Promise<GameTeamAthlete[]> {
    // let playerTeam = await GameTeam.findOneOrFail({
    //   where: {
    //     name: teamName,
    //     wallet_address: address,
    //     game: {
    //       gameId: gameId,
    //       contract: chain,
    //     },
    //     athletes:{
    //       athlete:{
    //         stats:{
    //           gameDate: Between(from, to)
    //         }
    //       }
    //     }
    //   },
    //   relations: {
    //     athletes:{
    //       athlete:{
    //         stats: true
    //       }
    //     }
    //   }
    // });
    let test = await GameTeamAthlete.find({
      where: {
        gameTeam: {
          name: teamName,
          wallet_address: address,
          game: {
            gameId: gameId,
            contract: chain,
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
          stats: true,
        },
      },
    });
    test.forEach((athlete) => {
      athlete.athlete.stats = athlete.athlete.stats.filter((stat) => {
        stat.gameDate &&
          moment(stat.gameDate).unix() >= moment(from).unix() &&
          moment(stat.gameDate).unix() <= moment(to).unix();
      });
    });
    return test;
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

  @Query(() => [UserAthleteResponse])
  async getUserAthletePortfolio(
    @Arg('accountId') accountId: string,
    @Arg('sportType') sportType: SportType
  ): Promise<UserAthleteResponse[]> {
    const nearApi = await setup();
    const account = await nearApi.account(
      process.env.NEAR_MAIN_ACCOUNT_ID || ''
    );
    let contractId;

    switch (sportType) {
      case SportType.NFL:
        contractId = process.env.ATHLETE_NFL_NFT_ACCOUNT_ID;
        break;
      case SportType.NBA:
        contractId = process.env.ATHLETE_NBA_NFT_ACCOUNT_ID;
        break;
      case SportType.MLB:
        contractId = process.env.ATHLETE_MLB_NFT_ACCOUNT_ID;
        break;
      default:
        contractId = process.env.ATHLETE_NFL_NFT_ACCOUNT_ID;
        break;
    }

    const contract: any = new Contract(account, contractId || '', {
      viewMethods: ['nft_tokens_for_owner'],
      changeMethods: [],
    });

    const res: any = await contract.nft_tokens_for_owner({
      account_id: accountId,
    });
    const ids = res.map((token: any) => {
      const idTrait = JSON.parse(token.metadata.extra).find(
        (trait: any) => trait.trait_type === 'athlete_id'
      );
      return { tokenId: token.token_id, id: parseInt(idTrait.value) };
    });
    const athletes = await Athlete.find({
      where: { id: In(ids.map((id: any) => id.id)) },
      relations: { team: true, stats: { opponent: true } },
    });

    return athletes.map((athlete) => {
      return {
        tokenId: ids.find((id: any) => id.id === athlete.id)?.tokenId,
        athlete: athlete,
      };
    });
  }

  @Authorized('ADMIN')
  @Mutation(() => Number)
  async addAthletesToFilebaseS3IPFSBucket(
    @Arg('sportType') sportType: SportType,
    @Arg('isPromo') isPromo: boolean = false
  ): Promise<Number> {
    let athleteIds: number[] = [];
    const nftImages = ['nftImageLocked', 'nftImagePromo'];
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
    }

    const athletes = await Athlete.find({
      where: {
        apiId: In(athleteIds),
      },
    });
    console.log(athletes.length);
    // try {
    //   const filepath = path.join(__dirname, "/temp-images");
    //   console.log(filepath);
    //   await fs.promises.mkdir(filepath, {
    //     recursive: true,
    //   });
    //   await fs.promises.rm(filepath, { recursive: true });
    // } catch (e) {
    //   console.log(e);
    // }

    //let fileArray: Buffer[] = new Buffer[];
    for (let athlete of athletes) {
      for (let imageType of nftImages) {
        // console.log(`Reading athlete ${athlete.id}`);

        // // const request = s3Filebase.putObject(fileBaseParams)
        // // request.on('httpHeaders', async (statusCode, headers) => {
        // //   console.log(`Status Code ${statusCode}`)
        // //   console.log(`CID: ${headers['x-amz-meta-cid']}`)
        // //   athlete.nftAnimation = headers['x-amz-meta-cid']
        // //   await Athlete.save(athlete)
        // // })
        // // request.send()
        let fileType = '';
        let response: AxiosResponse;
        // let link = "";
        switch (imageType) {
          case 'nftImageLocked':
            response = await axios.get(athlete.nftImageLocked ?? 'default', {
              responseType: 'arraybuffer',
            });
            //link = athlete.nftImageLocked ?? 'default'
            fileType = 'SB';
            break;
          case 'nftImagePromo':
            response = await axios.get(athlete.nftImagePromo ?? 'default', {
              responseType: 'arraybuffer',
            });
            //link = athlete.nftImagePromo ?? 'default'
            fileType = 'P';
            break;
          case 'nftImage':
          default:
            response = await axios.get(athlete.nftImage ?? 'default', {
              responseType: 'arraybuffer',
            });
            //link = athlete.nftImage ?? 'default'
            fileType = 'R';
            //console.log(response);
            break;
        }
        //fileArray.push(Buffer.from(response.data, "utf8"));
        const data = Buffer.from(response.data, 'utf8');
        const fileBaseParams = {
          Bucket: process.env.FILEBUCKET_BUCKET_NAME ?? '',
          ContentType: 'image/svg+xml',
          Key: `${fileType}_${athlete.apiId}`,
          ACL: 'public-read',
          Body: data,
          Metadata: {
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            apiId: athlete.apiId.toString(),
          },
        };
        const request = s3Filebase.putObject(fileBaseParams);
        request.on('httpHeaders', async (statusCode, headers) => {
          // console.log(`Status Code ${statusCode}`);
          let test = statusCode;
          // console.log(`Filename: ${fileType}_${athlete.apiId}`);
          // console.log(`CID: ${headers['x-amz-meta-cid']}`);
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
          console.log(error);
        });
        request.send();
      }
    }

    return athletes.length;
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
    }
    //const network = "maticmum"; // polygon testnet
    const network = 'maticmum'; // Polygon zkEVM Testnet ChainId
    try {
      const provider = new ethers.AlchemyProvider(
        network,
        //process.env.ALCHEMY_ZKEVM_TESTNET_API_KEY
        process.env.ALCHEMY_POLYGON_MUMBAI_API_KEY
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
          console.log('going here');
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

      const chunkifiedAthletes = chunkify(athletes, 35, false);
      console.log(chunkifiedAthletes.length);
      for (const chunk of chunkifiedAthletes) {
        console.log('Executing add athletes...');
        try {
          await contract.executeAddAthletes(chunk, {
            from: process.env.METAMASK_WALLET_ADDRESS,
            gasPrice: 1500000000,
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
        athleteIds = MLB_ATHLETE_PROMO_IDS;
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

  @Authorized('ADMIN')
  @Mutation(() => String)
  async updateNflAthleteStatsSeason(
    @Arg('season') season: string
  ): Promise<String> {
    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (status === 200) {
      const newStats: AthleteStat[] = [];
      const updateStats: AthleteStat[] = [];

      for (let athleteStat of data) {
        const apiId: number = athleteStat['PlayerID'];
        const numberOfGames: number =
          athleteStat['Played'] > 0 ? athleteStat['Played'] : 1;
        const curStat = await AthleteStat.findOne({
          where: {
            athlete: { apiId },
            season: season.toString(),
            type: AthleteStatType.SEASON,
          },
          relations: {
            athlete: true,
          },
        });

        if (curStat) {
          // Update stats here
          curStat.fantasyScore =
            athleteStat['FantasyPointsDraftKings'] / numberOfGames;
          curStat.completion =
            athleteStat['PassingCompletionPercentage'] / numberOfGames;
          curStat.carries = athleteStat['RushingAttempts'] / numberOfGames;
          curStat.passingYards = athleteStat['PassingYards'] / numberOfGames;
          curStat.rushingYards = athleteStat['RushingYards'] / numberOfGames;
          curStat.receivingYards =
            athleteStat['ReceivingYards'] / numberOfGames;
          curStat.interceptions =
            athleteStat['PassingInterceptions'] / numberOfGames;
          curStat.passingTouchdowns =
            athleteStat['PassingTouchdowns'] / numberOfGames;
          curStat.rushingTouchdowns =
            athleteStat['RushingTouchdowns'] / numberOfGames;
          curStat.receivingTouchdowns =
            athleteStat['ReceivingTouchdowns'] / numberOfGames;
          curStat.targets = athleteStat['ReceivingTargets'] / numberOfGames;
          curStat.receptions = athleteStat['Receptions'] / numberOfGames;
          curStat.played = athleteStat['Played'];
          updateStats.push(curStat);
        } else {
          const curAthlete = await Athlete.findOne({
            where: { apiId },
          });

          if (curAthlete) {
            newStats.push(
              AthleteStat.create({
                athlete: curAthlete,
                season: season.toString(),
                type: AthleteStatType.SEASON,
                position: athleteStat['Position'],
                played: athleteStat['Played'],
                fantasyScore:
                  athleteStat['FantasyPointsDraftKings'] / numberOfGames,
                completion:
                  athleteStat['PassingCompletionPercentage'] / numberOfGames,
                carries: athleteStat['RushingAttempts'] / numberOfGames,
                passingYards: athleteStat['PassingYards'] / numberOfGames,
                rushingYards: athleteStat['RushingYards'] / numberOfGames,
                receivingYards: athleteStat['ReceivingYards'] / numberOfGames,
                passingTouchdowns:
                  athleteStat['PassingTouchdowns'] / numberOfGames,
                interceptions:
                  athleteStat['PassingInterceptions'] / numberOfGames,
                rushingTouchdowns:
                  athleteStat['RushingTouchdowns'] / numberOfGames,
                receivingTouchdowns:
                  athleteStat['ReceivingTouchdowns'] / numberOfGames,
                targets: athleteStat['ReceivingTargets'] / numberOfGames,
                receptions: athleteStat['Receptions'] / numberOfGames,
              })
            );
          }
        }
      }

      await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });

      return `New Stats Added: ${newStats.length} | Stats Updated: ${updateStats.length}`;
    }

    return 'No stats added or updated';
  }

  @Authorized('ADMIN')
  @Mutation(() => String)
  async updateNflAthleteStatsPerWeek(
    @Arg('season') season: string,
    @Arg('lastWeekOfSeason') week: string
  ): Promise<String> {
    for (let curWeek = 1; curWeek <= Number(week); curWeek++) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${curWeek}?key=${process.env.SPORTS_DATA_NFL_KEY}`
      );

      if (status === 200) {
        const newStats: AthleteStat[] = [];
        const updateStats: AthleteStat[] = [];

        for (let athleteStat of data) {
          const apiId: number = athleteStat['PlayerID'];
          const curStat = await AthleteStat.findOne({
            where: {
              athlete: { apiId },
              season: season,
              week: curWeek.toString(),
              type: AthleteStatType.WEEKLY,
            },
            relations: {
              athlete: true,
            },
          });

          const opponent = await Team.findOne({
            where: { apiId: athleteStat['GlobalOpponentID'] },
          });

          if (curStat) {
            // Update stats here
            curStat.fantasyScore = athleteStat['FantasyPointsDraftKings'];
            curStat.completion = athleteStat['PassingCompletionPercentage'];
            curStat.carries = athleteStat['RushingAttempts'];
            curStat.passingYards = athleteStat['PassingYards'];
            curStat.rushingYards = athleteStat['RushingYards'];
            curStat.receivingYards = athleteStat['ReceivingYards'];
            curStat.interceptions = athleteStat['PassingInterceptions'];
            curStat.passingTouchdowns = athleteStat['PassingTouchdowns'];
            curStat.rushingTouchdowns = athleteStat['RushingTouchdowns'];
            curStat.receivingTouchdowns = athleteStat['ReceivingTouchdowns'];
            curStat.targets = athleteStat['ReceivingTargets'];
            curStat.receptions = athleteStat['Receptions'];
            curStat.played = athleteStat['Played'];
            curStat.opponent = opponent;
            updateStats.push(curStat);
          } else {
            const curAthlete = await Athlete.findOne({
              where: { apiId },
            });

            if (curAthlete) {
              newStats.push(
                AthleteStat.create({
                  athlete: curAthlete,
                  season: season,
                  week: curWeek.toString(),
                  opponent: opponent,
                  gameDate: new Date(athleteStat['GameDate']),
                  type: AthleteStatType.WEEKLY,
                  played: athleteStat['Played'],
                  position: athleteStat['Position'],
                  fantasyScore: athleteStat['FantasyPointsDraftKings'],
                  completion: athleteStat['PassingCompletionPercentage'],
                  carries: athleteStat['RushingAttempts'],
                  passingYards: athleteStat['PassingYards'],
                  rushingYards: athleteStat['RushingYards'],
                  receivingYards: athleteStat['ReceivingYards'],
                  passingTouchdowns: athleteStat['PassingTouchdowns'],
                  interceptions: athleteStat['PassingInterceptions'],
                  rushingTouchdowns: athleteStat['RushingTouchdowns'],
                  receivingTouchdowns: athleteStat['ReceivingTouchdowns'],
                  targets: athleteStat['ReceivingTargets'],
                  receptions: athleteStat['Receptions'],
                })
              );
            }
          }
        }

        await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });

        console.log(`Update NFL Athlete Stats Week ${curWeek}: FINISHED`);
      }
    }

    return 'Finished updating all weekly stats for NFL';
  }
}
