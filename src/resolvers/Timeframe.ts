import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql'
import { Timeframe } from '../entities/Timeframe'
import { MoreThan, LessThan, Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm" 
import { SportType } from '../utils/types'
@Resolver()
export class TimeframeResolver {

  @Query(() => [Timeframe])
  async getNflSeason(
    @Arg("startDate") startDate: Date
  ): Promise<Timeframe[]> {

    return await Timeframe.find({
      where: {
        startDate: LessThanOrEqual(startDate),
        endDate: MoreThanOrEqual(startDate),
        sport: SportType.NFL,
      }
    })
    
  }
  @Query(() => Timeframe)
  async getSportCurrentSeason(
    @Arg("sport") sport: SportType
  ): Promise<Timeframe>{
    return await Timeframe.findOneOrFail({
      where: {
        sport: sport
      }
    })
  }
}