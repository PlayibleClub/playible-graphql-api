import { Arg, Query, Resolver } from "type-graphql"

import { Athlete } from "../entities/Athlete"

@Resolver()
export class AthleteResolver {
  @Query(() => Athlete)
  async getAthleteById(@Arg("id") id: number): Promise<Athlete> {
    return await Athlete.findOneOrFail({
      where: { id },
      relations: {
        stats: true,
      },
    })
  }
}
