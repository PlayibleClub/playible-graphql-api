import { Arg, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql"

import { Game } from "../entities/Game"
import { CreateGameArgs, GetGameArgs } from "../args/GameArgs"
import { GameTab } from "../utils/types"
import { LessThanOrEqual, MoreThan, MoreThanOrEqual } from "typeorm"

@ObjectType()
class GameResponse {
  @Field()
  count: number
  @Field(() => [Game], { nullable: true })
  data?: Game[] | null
}

@Resolver()
export class GameResolver {
  @Query(() => Game)
  async getGameById(@Arg("id") id: number): Promise<Game> {
    return await Game.findOneOrFail({
      where: { id },
      relations: {
        teams: { athletes: { asset: true, athlete: true }, account: true },
      },
    })
  }

  @Query(() => GameResponse)
  async getGames(
    @Arg("args", { nullable: true }) { filter, pagination }: GetGameArgs
  ): Promise<GameResponse> {
    let args: any = {}
    var now = new Date()

    if (pagination) {
      args["take"] = pagination.limit
      args["skip"] = pagination.offset
    }

    switch (filter?.tab) {
      case GameTab.NEW:
        args = {
          ...args,
          where: {
            startTime: MoreThan(now),
          },
        }
        break
      case GameTab.ACTIVE:
        args = {
          ...args,
          where: {
            startTime: LessThanOrEqual(now),
            endTime: MoreThanOrEqual(now),
          },
        }
        break
      case GameTab.COMPLETED:
        args = {
          ...args,
          where: {
            endTime: LessThanOrEqual(now),
          },
        }
        break
      default:
        break
    }

    const [data, count] = await Game.findAndCount({
      ...args,
      where: filter?.sport
        ? { ...args.where, sport: filter?.sport }
        : args.where,
      relations: {
        teams: { athletes: { asset: true, athlete: true }, account: true },
      },
    })
    return { data, count }
  }

  @Mutation(() => Game)
  async createGame(
    @Arg("args")
    { name, startTime, endTime, duration, prize, sport }: CreateGameArgs
  ): Promise<Game> {
    const game = await Game.create({
      name,
      startTime,
      endTime,
      duration,
      prize,
      sport,
    }).save()

    return await Game.findOneOrFail({
      where: { id: game.id },
      relations: {
        teams: { athletes: { asset: true, athlete: true }, account: true },
      },
    })
  }
}
