import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver} from 'type-graphql'
import { Schedule } from '../entities/Schedule'
import { MoreThan, LessThan, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { SportType } from '../utils/types'

@Resolver()
export class ScheduleResolver {

  @Query(() => [Schedule])
  async getNbaPlayerSchedule(
    @Arg("startDate") startDate: Date,
    @Arg("endDate") endDate: Date,
    @Arg("team") team: string,
  ): Promise<Schedule[]>{

    return await Schedule.find({
      where:[
        {
          dateTime: Between(startDate, endDate),
          sport: SportType.NBA,
          homeTeam: team
        },
        {
          dateTime: Between(startDate, endDate),
          sport: SportType.NBA,
          awayTeam: team
        }
      ]
    })
  }
}