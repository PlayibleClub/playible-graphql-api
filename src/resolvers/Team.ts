import { notEqual } from 'assert'
import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from  'type-graphql'
import { Not } from 'typeorm'
import { Team } from '../entities/Team'
import { SportType } from './../utils/types'
@Resolver()
export class TeamResolver {
  @Query(() => [Team])
  async getTeams(
    @Arg("sport") sport: SportType,
  ) : Promise<Team[]>{
   
    return await Team.find({
      where: {
        sport: sport,
        location: Not("Team"),
      },
      order:{
        key: "ASC",
      }
    })
  }
}