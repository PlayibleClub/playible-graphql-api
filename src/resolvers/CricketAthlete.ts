import { AthleteStatType, SportType } from './../utils/types'
import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql'

import { CricketAthlete } from '../entities/CricketAthlete'
import { CricketAthleteStat } from '../entities/CricketAthleteStat'
import { CricketTeam } from '../entities/CricketTeam'
import moment from 'moment'
@Resolver()
export class CricketAthleteResolver {
  @Query(() => CricketAthlete)
  async getAthleteByKey(
    @Arg("key") key: string,
    @Arg("from", { nullable: true}) from?: Date,
    @Arg("to", { nullable: true}) to?: Date
  ) : Promise<CricketAthlete>{
    const athlete = await CricketAthlete.findOneOrFail({
      where: {playerKey: key},
      relations: {
        stats: {
          match: true
        },
        cricketTeam: true,
      }
    })

    if(from){
      athlete.stats = athlete.stats.filter((stat) => stat.match.start_at && moment(stat.match.start_at).unix() >= moment(from).unix())
    }
    if(to){
      athlete.stats = athlete.stats.filter((stat) => stat.match.start_at && moment(stat.match.start_at).unix() <= moment(from).unix())
    }

    return athlete
  }
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
    // const athlete = await CricketAthlete.findOneOrFail({
    //   where: { playerKey: playerKey },
    //   relations: {
    //     stats:{
    //       match: true
    //     },
    //     cricketTeam: true,
    //   } 
    // })

    // if(matchKey){
    //   athlete.stats = athlete.stats.filter((stat) => stat.match.key === matchKey)
    // }
    // return athlete
    const athlete = await CricketAthlete.findOneOrFail({
      where: { playerKey: playerKey},
      relations: {
        stats: {
          match: {
            team_a: true,
            team_b: true,
          }
        },
        cricketTeam: true
      }
    })
    if(matchKey){
      athlete.stats = athlete.stats.filter((stat) => stat.match.key === matchKey)
    }
    return athlete
  }
  @Query(() => CricketAthlete)
  async getCricketAthleteAvgFantasyScore(
    @Arg("playerKey") playerKey: string,
  ): Promise<CricketAthlete>{
    const athlete = await CricketAthlete.findOneOrFail({
      where: { playerKey: playerKey},
      relations: {
        stats: {
          match: true,
        }
      }
    })
    athlete.stats = athlete.stats.filter((stat) => stat.match.status === 'completed' && stat.type === AthleteStatType.SEASON)
    return athlete
  }
  // @Query(() => [CricketAthlete])
  // async getAthlete(

  // )
  
}
