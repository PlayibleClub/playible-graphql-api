import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql'
import { Timeframe } from '../entities/Timeframe'
import { MoreThan, LessThan, Between } from "typeorm" 
@Resolver()
export class TimeframeResolver {

  @Query(() => [Timeframe])
  async getTimeframeByDate(
    @Arg("startDate") startDate: Date,
    @Arg("endDate") endDate: Date,
  ): Promise<Timeframe[]> {

    return await Timeframe.find({
      where: {
        startDate: Between(startDate, endDate)
      }
    })
    
  }
}