import {
  Arg,
  Authorized,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql';

import { Account } from '../entities/Account';
import { Asset } from '../entities/Asset';
import { Athlete } from '../entities/Athlete';
import { AthleteStat } from '../entities/AthleteStat';
import { Collection } from '../entities/Collection';
import { Game } from '../entities/Game';
import { GameTeam } from '../entities/GameTeam';
import { GameTeamAthlete } from '../entities/GameTeamAthlete';
import { LeaderboardResult } from '../utils/types';
import {
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  QueryBuilder,
} from 'typeorm';
import { CreateGameArgs, CreateTeamArgs, GetGameArgs } from '../args/GameArgs';
import { GameTab, SportType, ContractType } from '../utils/types';
import { AppDataSource } from '../utils/db';
import moment from 'moment-timezone';
import { Leaderboard } from '../entities/Leaderboard';
@ObjectType()
class GameResponse {
  @Field()
  count: number;
  @Field(() => [Game], { nullable: true })
  data?: Game[] | null;
}

@ObjectType()
class CreateTeamResponse {
  @Field(() => [String], { nullable: true })
  errors?: string[];
  @Field(() => GameTeam, { nullable: true })
  team?: GameTeam | null;
}

@Resolver()
export class GameResolver {
  @Query(() => Game)
  async getGameById(@Arg('id') id: number): Promise<Game> {
    return await Game.findOneOrFail({
      where: { id },
      relations: {
        teams: {
          //account: true,
          athletes: {
            athlete: { team: true, stats: true },
            //asset: { collection: true },
          },
        },
      },
    });
  }

  @Query(() => Game)
  async getGameByGameIdAndChain(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ContractType
  ): Promise<Game> {
    return await Game.findOneOrFail({
      where: {
        gameId: gameId,
        sport: sport,
        contract: chain,
      },
      relations: {
        teams: {
          athletes: {
            athlete: {
              team: true,
              stats: true,
            },
          },
        },
      },
    });
  }

  @Query(() => GameResponse)
  async getGames(
    @Arg('args', { nullable: true }) { filter, pagination }: GetGameArgs
  ): Promise<GameResponse> {
    let args: any = {};
    var now = new Date();

    if (pagination) {
      args['take'] = pagination.limit;
      args['skip'] = pagination.offset;
    }

    switch (filter?.tab) {
      case GameTab.NEW:
        args = {
          ...args,
          where: {
            startTime: MoreThan(now),
          },
        };
        break;
      case GameTab.ACTIVE:
        args = {
          ...args,
          where: {
            startTime: LessThanOrEqual(now),
            endTime: MoreThanOrEqual(now),
          },
        };
        break;
      case GameTab.COMPLETED:
        args = {
          ...args,
          where: {
            endTime: LessThanOrEqual(now),
          },
        };
        break;
      default:
        break;
    }

    const [data, count] = await Game.findAndCount({
      ...args,
      where: filter?.sport
        ? { ...args.where, sport: filter?.sport }
        : args.where,
      relations: {
        teams: {
          account: true,
          athletes: {
            athlete: { team: true, stats: true },
            asset: { collection: true },
          },
        },
      },
      order: {
        id: 'ASC',
      },
    });
    return { data, count };
  }

  @Query(() => [LeaderboardResult])
  async getLeaderboardTeams(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('contract') contract: ContractType
  ): Promise<LeaderboardResult[]> {
    const returnTeam = await AppDataSource.getRepository(Game)
      .createQueryBuilder('g')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        '0 as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .where('g.gameId = :gameId', { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('g.contract = :contract', { contract: contract })
      .getRawMany();
    console.log(returnTeam);
    return returnTeam;
  }
  @Query(() => [LeaderboardResult])
  async getLeaderboardResult(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('contract') contract: ContractType
  ): Promise<LeaderboardResult[]> {
    const returnTeam = await AppDataSource.getRepository(Game)
      .createQueryBuilder('g')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where('g.gameId = :gameId', { gameId: gameId })
      .andWhere('as2.gameDate >= g.startTime')
      .andWhere('as2.gameDate <= g.endTime')
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('as2.played = 1')
      .andWhere('g.contract = :contract', { contract: contract })
      .getRawMany();
    console.log(returnTeam);
    return returnTeam;
  }

  @Query(() => [LeaderboardResult])
  async getLeaderboardResultForPlayer(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('contract') contract: ContractType,
    @Arg('address') address: string,
    @Arg('teamName') teamName: string
  ): Promise<LeaderboardResult[]> {
    const returnTeam = await AppDataSource.getRepository(Game)
      .createQueryBuilder('g')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where('g.gameId = :gameId', { gameId: gameId })
      .andWhere('as2.gameDate >= g.startTime')
      .andWhere('as2.gameDate <= g.endTime')
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('as2.played = 1')
      .andWhere('g.contract = :contract', { contract: contract })
      .andWhere('gt.name = :teamName', { teamName: teamName })
      .andWhere('gt.wallet_address = :address', { address: address })
      .getRawMany();
    console.log(returnTeam);
    return returnTeam;
  }

  @Query(() => Boolean)
  async getMultiChainLeaderboardInfo(
    @Arg('gameId') id: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ContractType
  ): Promise<Boolean> {
    let result;
    switch (chain) {
      case ContractType.POLYGON:
        result = await Leaderboard.findOne({
          where: {
            sport: sport,
            polygonGame: {
              id: id,
            },
          },
        });
        if (result !== null) {
          return true;
        } else {
          return false;
        }
      case ContractType.NEAR:
        result = await Leaderboard.findOne({
          where: {
            sport: sport,
            nearGame: {
              id: id,
            },
          },
        });
        if (result !== null) {
          return true;
        } else {
          return false;
        }
    }
  }

  @Query(() => [LeaderboardResult])
  async getMultiChainLeaderboardTeams(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ContractType
  ): Promise<LeaderboardResult[]> {
    let gameChain: string; //default
    switch (chain) {
      case ContractType.POLYGON:
        gameChain = 'l.polygonGame = :gameId';
        break;
      case ContractType.NEAR:
        gameChain = 'l.nearGame = :gameId';
        break;
      default:
        return [];
    }

    //separate results
    const polygonResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        '0 as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('l.polygonGame', 'g')
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .where(gameChain, { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      // .andWhere('as.gameDate >= g.startTime')
      // .andWhere('as.gameDate <= g.endTime')
      //.andWhere('as.played = 1')
      .getRawMany();
    const nearResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        '0 as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('l.nearGame', 'g')
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .where(gameChain, { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      // .andWhere('as.gameDate >= g.startTime')
      // .andWhere('as.gameDate <= g.endTime')
      //.andWhere('as.played = 1')
      .getRawMany();

    console.log(polygonResults);
    console.log(nearResults);
    const results = polygonResults.concat(nearResults);
    results.sort((a, b) => b.total - a.total);
    return results;
  }
  @Query(() => [LeaderboardResult])
  async getMultiChainLeaderboardResult(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ContractType
  ): Promise<LeaderboardResult[]> {
    let gameChain: string; //default
    switch (chain) {
      case ContractType.POLYGON:
        gameChain = 'l.polygonGame = :gameId';
        break;
      case ContractType.NEAR:
        gameChain = 'l.nearGame = :gameId';
        break;
      default:
        return [];
    }

    const season = '2023REG';
    const type = 'season';
    //separate results
    const polygonResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('l.polygonGame', 'g')
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where(gameChain, { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('as2.season = :season', { season: season })
      .andWhere('as2.type = :type', { type: type })
      // .andWhere('as.gameDate >= g.startTime')
      // .andWhere('as.gameDate <= g.endTime')
      //.andWhere('as.played = 1')
      .getRawMany();
    const nearResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.contract')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.contract as chain_name',
      ])
      .innerJoin('l.nearGame', 'g')
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where(gameChain, { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      // .andWhere('as.gameDate >= g.startTime')
      // .andWhere('as.gameDate <= g.endTime')
      .andWhere('as2.season = :season', { season: season })
      .andWhere('as2.type = :type', { type: type })
      //.andWhere('as.played = 1')
      .getRawMany();

    console.log(polygonResults);
    console.log(nearResults);
    const results = polygonResults.concat(nearResults);
    results.sort((a, b) => b.total - a.total);
    return results;
  }

  //@Authorized('ADMIN')
  @Mutation(() => Leaderboard)
  async mergeIntoMultiChainLeaderboard(
    @Arg('nearGameId') nearGameId: number,
    @Arg('polygonGameId') polygonGameId: number,
    @Arg('sport') sport: SportType
  ): Promise<Leaderboard> {
    //find gameIds of both NEAR and Polygon contracts to merge
    const nearGame = await Game.findOneOrFail({
      where: {
        sport: sport,
        gameId: nearGameId,
        contract: ContractType.NEAR,
      },
    });
    const polygonGame = await Game.findOneOrFail({
      where: {
        sport: sport,
        gameId: polygonGameId,
        contract: ContractType.POLYGON,
      },
    });

    const newLeaderboard = await Leaderboard.create({
      sport: sport,
      nearGame: nearGame,
      polygonGame: polygonGame,
    }).save();

    return newLeaderboard;
  }

  @Authorized('ADMIN')
  @Mutation(() => Game)
  async createGame(
    @Arg('args')
    { name, description, startTime, endTime, prize, sport }: CreateGameArgs
  ): Promise<Game> {
    const game = await Game.create({
      name,
      description,
      startTime,
      endTime,
      prize,
      sport,
    }).save();

    return await Game.findOneOrFail({
      where: { id: game.id },
      relations: {
        teams: {
          athletes: { athlete: { team: true, stats: true } },
          //account: true,
        },
      },
    });
  }

  @Authorized('ADMIN')
  @Mutation(() => Boolean)
  async deleteGamebyId(@Arg('id') id: number): Promise<Boolean> {
    await Game.delete({ id });
    return true;
  }

  @Mutation(() => CreateTeamResponse)
  async createTeam(
    @Arg('args')
    { name, gameId, walletAddr, athletes }: CreateTeamArgs
  ): Promise<CreateTeamResponse> {
    const errors: string[] = [];

    // Check if game exists
    const game = await Game.findOne({ where: { id: gameId } });
    if (!game) {
      errors.push('Game does not exist.');
    }

    // Check if game could still be joined
    const now = new Date();
    if (game && now >= game?.startTime) {
      errors.push('Game could not be joined anymore.');
    }

    // Check if all athletes exist
    for (let athlete of athletes) {
      const curAthlete = await Athlete.findOne({
        where: { id: athlete.id },
        relations: { team: true },
      });
      if (!curAthlete) {
        errors.push(`Athlete ${athlete.id} does not exist.`);
      }
      if (curAthlete?.team.sport !== game?.sport) {
        errors.push(
          `Athlete ${athlete.id} does not match the sport of the game.`
        );
      }
    }

    if (errors.length) return { errors };

    let account = await Account.findOne({ where: { address: walletAddr } });
    if (!account) {
      account = await Account.create({
        address: walletAddr,
      }).save();
    }

    if (name && game && account) {
      let gameTeam = await GameTeam.create({
        name,
        game,
        //account,
      }).save();

      for (let athlete of athletes) {
        const curAthlete = await Athlete.findOneOrFail({
          where: { id: athlete.id },
        });

        let collection = await Collection.findOneBy({
          address: athlete.contractAddr,
        });
        if (!collection) {
          collection = await Collection.create({
            address: athlete.contractAddr,
          }).save();
        }

        let asset = await Asset.findOneBy({ tokenId: athlete.tokenId });
        if (!asset) {
          asset = await Asset.create({
            tokenId: athlete.tokenId,
            account,
            collection,
          }).save();
        }

        await GameTeamAthlete.create({
          gameTeam,
          //asset,
          athlete: curAthlete,
        }).save();
      }

      gameTeam = await GameTeam.findOneOrFail({
        where: { id: gameTeam.id },
        relations: {
          game: true,
          //account: true,
          athletes: {
            athlete: { team: true, stats: true },
            //asset: { collection: true },
          },
        },
      });

      return { team: gameTeam };
    }

    return { team: null };
  }
}
