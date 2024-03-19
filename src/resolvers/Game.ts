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
import { GameTab, SportType, ChainType } from '../utils/types';
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
    @Arg('chain') chain: ChainType
  ): Promise<Game> {
    return await Game.findOneOrFail({
      where: {
        gameId: gameId,
        sport: sport,
        chain: chain,
      },
      relations: {
        teams: {
          athletes: true,
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
    @Arg('chain') chain: ChainType
  ): Promise<LeaderboardResult[]> {
    const returnTeam = await AppDataSource.getRepository(Game)
      .createQueryBuilder('g')
      .groupBy('gt.id')
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        '0 as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
      ])
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .where('g.gameId = :gameId', { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('g.chain = :chain', { chain: chain })
      .getRawMany();
    //console.log(returnTeam);
    return returnTeam;
  }
  @Query(() => [LeaderboardResult])
  async getLeaderboardResult(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ChainType,
    @Arg('startTime') startTime: Date,
    @Arg('endTime') endTime: Date
  ): Promise<LeaderboardResult[]> {
    const returnTeam = await AppDataSource.getRepository(Game)
      .createQueryBuilder('g')
      .groupBy('gt.id')
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
      ])
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where('g.gameId = :gameId', { gameId: gameId })
      .andWhere('as2.gameDate >= :startTime', { startTime: startTime })
      .andWhere('as2.gameDate <= :endTime', { endTime: endTime })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('as2.played = 1')
      .andWhere('g.chain = :chain', { chain: chain })
      .getRawMany();
    //console.log(returnTeam);
    return returnTeam;
  }

  @Query(() => [LeaderboardResult])
  async getLeaderboardResultForPlayer(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ChainType,
    @Arg('address') address: string,
    @Arg('teamName') teamName: string
  ): Promise<LeaderboardResult[]> {
    const returnTeam = await AppDataSource.getRepository(Game)
      .createQueryBuilder('g')
      .groupBy('gt.id')
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
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
      .andWhere('g.chain = :chain', { chain: chain })
      .andWhere('gt.name = :teamName', { teamName: teamName })
      .andWhere('gt.wallet_address = :address', { address: address })
      .getRawMany();
    //console.log(returnTeam);
    return returnTeam;
  }

  @Query(() => Leaderboard)
  async checkIfGameExistsInMultiChainLeaderboard(
    @Arg('gameId') id: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ChainType
  ): Promise<Leaderboard> {
    let result;
    switch (chain) {
      case ChainType.POLYGON:
        result = await Leaderboard.findOneOrFail({
          where: {
            sport: sport,
            polygonGame: {
              id: id,
            },
          },
          relations: {
            polygonGame: true,
            nearGame: true,
          },
        });
        return result;
      case ChainType.NEAR:
        result = await Leaderboard.findOneOrFail({
          where: {
            sport: sport,
            nearGame: {
              id: id,
            },
          },
          relations: {
            polygonGame: true,
            nearGame: true,
          },
        });
        return result;
    }
  }

  @Query(() => [LeaderboardResult])
  async getMultiChainLeaderboardTeams(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ChainType
  ): Promise<LeaderboardResult[]> {
    let gameChain: string; //default
    switch (chain) {
      case ChainType.POLYGON:
        gameChain = 'l.polygonGame = :gameId';
        break;
      case ChainType.NEAR:
        gameChain = 'l.nearGame = :gameId';
        break;
      default:
        return [];
    }

    //separate results
    const polygonResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        '0 as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
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
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        '0 as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
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

    //console.log(polygonResults);
    //console.log(nearResults);
    const results = polygonResults.concat(nearResults);
    // results.sort((a, b) => b.total - a.total);
    return results;
  }
  @Query(() => [LeaderboardResult])
  async getMultiChainLeaderboardResult(
    @Arg('gameId') gameId: number,
    @Arg('sport') sport: SportType,
    @Arg('chain') chain: ChainType,
    @Arg('startTime') startTime: Date,
    @Arg('endTime') endTime: Date
  ): Promise<LeaderboardResult[]> {
    let gameChain: string; //default
    switch (chain) {
      case ChainType.POLYGON:
        gameChain = 'l.polygonGame = :gameId';
        break;
      case ChainType.NEAR:
        gameChain = 'l.nearGame = :gameId';
        break;
      default:
        return [];
    }

    //separate results
    const polygonResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
      ])
      .innerJoin('l.polygonGame', 'g')
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where(gameChain, { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('as2.gameDate >= :startTime', { startTime: startTime })
      .andWhere('as2.gameDate <= :endTime', { endTime: endTime })
      .andWhere('as2.played = 1')
      .getRawMany();
    const nearResults = await AppDataSource.getRepository(Leaderboard)
      .createQueryBuilder('l')
      .groupBy('gt.id')
      .addGroupBy('g.chain')
      .orderBy('total', 'DESC')
      .select([
        'SUM(as2.fantasyScore) as total',
        'gt.name as team_name',
        'gt.id as game_team_id',
        'gt.wallet_address as wallet_address',
        'g.chain as chain_name',
      ])
      .innerJoin('l.nearGame', 'g')
      .innerJoin('g.teams', 'gt')
      .innerJoin('gt.athletes', 'gta')
      .innerJoin('gta.athlete', 'a')
      .innerJoin('a.stats', 'as2')
      .where(gameChain, { gameId: gameId })
      .andWhere('g.sport = :sport', { sport: sport })
      .andWhere('as2.gameDate >= :startTime', { startTime: startTime })
      .andWhere('as2.gameDate <= :endTime', { endTime: endTime })
      .andWhere('as2.played = 1')
      .getRawMany();

    const results = polygonResults.concat(nearResults);
    results.sort((a, b) => b.total - a.total);
    return results;
  }

  @Authorized('ADMIN')
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
        chain: ChainType.NEAR,
      },
    });
    const polygonGame = await Game.findOneOrFail({
      where: {
        sport: sport,
        gameId: polygonGameId,
        chain: ChainType.POLYGON,
      },
    });

    const newLeaderboard = await Leaderboard.create({
      sport: sport,
      nearGame: nearGame,
      polygonGame: polygonGame,
    }).save();

    return newLeaderboard;
  }
}
