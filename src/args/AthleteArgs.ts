import { LimitOffset, SportType } from "../utils/types"
import { InputType, Field } from "type-graphql"

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
