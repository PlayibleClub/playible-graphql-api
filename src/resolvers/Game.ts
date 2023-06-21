import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql"

import { Account } from "../entities/Account"
import { Asset } from "../entities/Asset"
import { Athlete } from "../entities/Athlete"
import { Collection } from "../entities/Collection"
import { Game } from "../entities/Game"
import { GameTeam } from "../entities/GameTeam"
import { GameTeamAthlete } from "../entities/GameTeamAthlete"

import { LessThanOrEqual, MoreThan, MoreThanOrEqual } from "typeorm"
import { CreateGameArgs, CreateTeamArgs, GetGameArgs } from "../args/GameArgs"
import { GameTab } from "../utils/types"

@ObjectType()
class GameResponse {
  @Field()
  count: number
  @Field(() => [Game], { nullable: true })
  data?: Game[] | null
}

@ObjectType()
class CreateTeamResponse {
  @Field(() => [String], { nullable: true })
  errors?: string[]
  @Field(() => GameTeam, { nullable: true })
  team?: GameTeam | null
}

@Resolver()
export class GameResolver {
  @Query(() => Game)
  async getGameById(@Arg("id") id: number): Promise<Game> {
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
    })
  }

  @Query(() => GameResponse)
  async getGames(@Arg("args", { nullable: true }) { filter, pagination }: GetGameArgs): Promise<GameResponse> {
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
      where: filter?.sport ? { ...args.where, sport: filter?.sport } : args.where,
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
        id: "ASC",
      },
    })
    return { data, count }
  }

  @Authorized("ADMIN")
  @Mutation(() => Game)
  async createGame(
    @Arg("args")
    { name, description, startTime, endTime, prize, sport }: CreateGameArgs
  ): Promise<Game> {
    const game = await Game.create({
      name,
      description,
      startTime,
      endTime,
      prize,
      sport,
    }).save()

    return await Game.findOneOrFail({
      where: { id: game.id },
      relations: {
        teams: {
          athletes: { athlete: { team: true, stats: true } },
          //account: true,
        },
      },
    })
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async deleteGamebyId(@Arg("id") id: number): Promise<Boolean> {
    await Game.delete({ id })
    return true
  }

  @Mutation(() => CreateTeamResponse)
  async createTeam(
    @Arg("args")
    { name, gameId, walletAddr, athletes }: CreateTeamArgs
  ): Promise<CreateTeamResponse> {
    const errors: string[] = []

    // Check if game exists
    const game = await Game.findOne({ where: { id: gameId } })
    if (!game) {
      errors.push("Game does not exist.")
    }

    // Check if game could still be joined
    const now = new Date()
    if (game && now >= game?.startTime) {
      errors.push("Game could not be joined anymore.")
    }

    // Check if all athletes exist
    for (let athlete of athletes) {
      const curAthlete = await Athlete.findOne({
        where: { id: athlete.id },
        relations: { team: true },
      })
      if (!curAthlete) {
        errors.push(`Athlete ${athlete.id} does not exist.`)
      }
      if (curAthlete?.team.sport !== game?.sport) {
        errors.push(`Athlete ${athlete.id} does not match the sport of the game.`)
      }
    }

    if (errors.length) return { errors }

    let account = await Account.findOne({ where: { address: walletAddr } })
    if (!account) {
      account = await Account.create({
        address: walletAddr,
      }).save()
    }

    if (name && game && account) {
      let gameTeam = await GameTeam.create({
        name,
        game,
        //account,
      }).save()

      for (let athlete of athletes) {
        const curAthlete = await Athlete.findOneOrFail({
          where: { id: athlete.id },
        })

        let collection = await Collection.findOneBy({
          address: athlete.contractAddr,
        })
        if (!collection) {
          collection = await Collection.create({
            address: athlete.contractAddr,
          }).save()
        }

        let asset = await Asset.findOneBy({ tokenId: athlete.tokenId })
        if (!asset) {
          asset = await Asset.create({
            tokenId: athlete.tokenId,
            account,
            collection,
          }).save()
        }

        await GameTeamAthlete.create({
          gameTeam,
          //asset,
          athlete: curAthlete,
        }).save()
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
      })

      return { team: gameTeam }
    }

    return { team: null }
  }
}
