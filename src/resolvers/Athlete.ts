import { Contract } from "near-api-js"
import { Arg, Field, ObjectType, Query, Resolver } from "type-graphql"
import { AthleteSortOptions, GetAthletesArgs } from "../args/AthleteArgs"
import { setup } from "../near-api"

import { Athlete } from "../entities/Athlete"
import { MoreThan, MoreThanOrEqual } from "typeorm"

@ObjectType()
class Distribution {
  @Field()
  rank: number
  @Field()
  percentage: number
}

@ObjectType()
class TestResponse {
  @Field()
  gameId: string
  @Field()
  prize: number
  @Field(() => [Distribution])
  distribution: Distribution[]
}

@Resolver()
export class AthleteResolver {
  @Query(() => Athlete)
  async getAthleteById(@Arg("id") id: number): Promise<Athlete> {
    return await Athlete.findOneOrFail({
      where: { id },
      relations: {
        stats: true,
        team: true,
      },
    })
  }

  @Query(() => [Athlete])
  async getAthletes(
    @Arg("args", { nullable: true }) { sort, filter, pagination }: GetAthletesArgs
  ): Promise<Athlete[]> {
    let args: any = {}
    let order: any = {
      id: "asc",
    }

    switch (sort) {
      case AthleteSortOptions.ID:
        order = {
          id: "asc",
        }
        break
      case AthleteSortOptions.SCORE:
        order = {
          stats: {
            fantasyScore: "desc",
          },
        }
        break
    }

    if (pagination) {
      args["take"] = pagination.limit
      args["skip"] = pagination.offset
    }

    let athletes = await Athlete.find({
      ...args,
      where: filter?.sport
        ? { team: { sport: filter?.sport }, stats: { fantasyScore: MoreThanOrEqual(0) } }
        : undefined,
      relations: {
        stats: true,
        team: true,
      },
      order: order,
    })

    return athletes
  }

  @Query(() => TestResponse)
  async testNearApi(): Promise<TestResponse> {
    const nearApi = await setup()
    const account = await nearApi.account("playible.testnet")
    const contract: any = new Contract(account, "oracle.playible.testnet", {
      viewMethods: ["contract_info", "owner", "game_info"],
      changeMethods: [],
    })

    const res: any = await contract.game_info({ game_id: "1" })

    return {
      gameId: res.game_id,
      prize: res.prize,
      distribution: res.distribution,
    }
  }
}
