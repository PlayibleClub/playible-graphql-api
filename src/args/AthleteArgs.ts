import { Field, InputType } from "type-graphql"
import { LimitOffset, SportType } from "../utils/types"

@InputType()
export class GetAthletesFilter {
  @Field({ nullable: true })
  sport?: SportType
}

@InputType()
export class GetAthletesArgs {
  @Field({ nullable: true })
  filter?: GetAthletesFilter
  @Field({ nullable: true })
  pagination?: LimitOffset
}
