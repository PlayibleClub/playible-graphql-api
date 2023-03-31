import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver} from 'type-graphql'
import { Schedule } from '../entities/Schedule'
import { MoreThan, LessThan, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { SportType } from '../utils/types'

@Resolver()
export class ScheduleResolver {

  @Query(() => [Schedule])
  async getPlayerSchedule(
    @Arg("startDate") startDate: Date,
    @Arg("endDate") endDate: Date,
    @Arg("team") team: string,
    @Arg("sport") sport: SportType
  ): Promise<Schedule[]>{

    return await Schedule.find({
      where:[
        {
          dateTimeUTC: Between(startDate, endDate),
          sport: sport,
          homeTeam: team
        },
        {
          dateTimeUTC: Between(startDate, endDate),
          sport: sport,
          awayTeam: team
        }
      ]
    })
  }
}