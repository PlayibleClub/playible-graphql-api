import { Contract } from "near-api-js"
import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql"
import { AthleteSortOptions, GetAthletesArgs } from "../args/AthleteArgs"
import { setup } from "../near-api"

import { Athlete } from "../entities/Athlete"
import { In, MoreThanOrEqual } from "typeorm"
import { CreateGameArgs } from "src/args/GameArgs"

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

@ObjectType()
class UserAthleteResponse {
  @Field()
  tokenId: string
  @Field(() => Athlete)
  athlete: Athlete
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
        : { stats: { fantasyScore: MoreThanOrEqual(0) } },
      relations: {
        stats: true,
        team: true,
      },
      order: order,
    })

    return athletes
  }

  @Query(() => [UserAthleteResponse])
  async getUserAthletePortfolio(@Arg("accountId") accountId: string): Promise<UserAthleteResponse[]> {
    const nearApi = await setup()
    const account = await nearApi.account(process.env.NEAR_MAIN_ACCOUNT_ID || "")
    const contract: any = new Contract(account, process.env.ATHLETE_NFT_ACCOUNT_ID || "", {
      viewMethods: ["nft_tokens_for_owner"],
      changeMethods: [],
    })

    const res: any = await contract.nft_tokens_for_owner({ account_id: accountId })
    const ids = res.map((token: any) => {
      const idTrait = JSON.parse(token.metadata.extra).find((trait: any) => trait.trait_type === "athlete_id")
      return { tokenId: token.token_id, id: parseInt(idTrait.value) }
    })
    const athletes = await Athlete.find({ where: { id: In(ids.map((id: any) => id.id)) }, relations: { team: true } })

    return athletes.map((athlete) => {
      return {
        tokenId: ids.find((id: any) => id.id === athlete.id)?.tokenId,
        athlete: athlete,
      }
    })
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async addStarterAthletesToOpenPackContract(): Promise<Boolean> {
    const nearApi = await setup()
    const account = await nearApi.account(process.env.NEAR_MAIN_ACCOUNT_ID || "")
    const contract: any = new Contract(account, process.env.OPENPACK_ACCOUNT_ID || "", {
      viewMethods: [],
      changeMethods: ["execute_add_athletes"],
    })

    const athlete_tokens = (await Athlete.find({ order: { id: "ASC" }, relations: { team: true } })).map((athlete) => {
      return {
        athlete_id: athlete.id.toString(),
        token_uri: athlete.nftImage,
        symbol: athlete.apiId.toString(),
        name: `${athlete.firstName} ${athlete.lastName}`,
        team: athlete.team.key,
        position: athlete.position,
      }
    })

    const res: any = await contract.execute_add_athletes({ pack_type: "starter", athlete_tokens }, "300000000000000")
    console.log(res)

    return true
  }
}
