import { Field, InputType } from "type-graphql"
import { AthleteStatType, LimitOffset, SportType } from "../utils/types"

@InputType()
export class GetAthletesFilter {
  @Field({ nullable: true })
  sport?: SportType
  @Field({ nullable: true })
  statType?: AthleteStatType
}

export enum AthleteSortOptions {
  ID = "id",
  SCORE = "score",
}

@InputType()
export class GetAthletesArgs {
  @Field({ nullable: true })
  sort?: AthleteSortOptions
  @Field({ nullable: true })
  filter?: GetAthletesFilter
  @Field({ nullable: true })
  pagination?: LimitOffset
}
