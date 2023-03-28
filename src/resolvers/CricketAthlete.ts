import { AthleteStatType, SportType } from './../utils/types'
import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql'

import { CricketAthlete } from '../entities/CricketAthlete'
import { CricketAthleteStat } from '../entities/CricketAthleteStat'
import { CricketTeam } from '../entities/CricketTeam'

@Resolver()
export class CricketAthleteResolver {
  @Query(() => CricketAthlete)
  async getAthleteMatchResults(
    @Arg("playerkey") playerKey: string,
    @Arg("matchKey", { nullable: true}) matchKey: string,
  ): Promise<CricketAthlete> {
    // const athlete = await CricketAthlete.findOneOrFail({
    //   where: { playerKey: playerKey, stats: {match: {key: matchKey}}},
    //   relations: {
    //     stats: {
    //       match: true
    //     },
    //     cricketTeam: true,
    //   }
    // })
    const athlete = await CricketAthlete.findOneOrFail({
      where: { playerKey: playerKey },
      relations: {
        stats:{
          match: true
        },
        cricketTeam: true,
      } 
    })

    if(matchKey){
      athlete.stats = athlete.stats.filter((stat) => stat.match.key === matchKey)
    }
    return athlete
  }

  // @Query(() => [CricketAthlete])
  // async getAthlete(

  // )
  
}
