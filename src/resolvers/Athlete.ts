import { Arg, Query, Resolver } from "type-graphql"
import { GetAthletesArgs } from "../args/AthleteArgs"

import { Athlete } from "../entities/Athlete"

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
  async getAthletes(@Arg("args", { nullable: true }) { filter, pagination }: GetAthletesArgs): Promise<Athlete[]> {
    let args: any = {}

    if (pagination) {
      args["take"] = pagination.limit
      args["skip"] = pagination.offset
    }

    return await Athlete.find({
      ...args,
      where: filter?.sport ? { team: { sport: filter?.sport } } : undefined,
      relations: {
        stats: true,
        team: true,
      },
      order: {
        id: "asc",
      },
    })
  }
}
