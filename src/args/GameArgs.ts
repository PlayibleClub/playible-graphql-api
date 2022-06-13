import { GameTab, LimitOffset, SportType } from "../utils/types"
import { InputType, Field } from "type-graphql"

@InputType()
export class CreateGameArgs {
  @Field()
  name!: string
  @Field()
  startTime!: Date
  @Field()
  endTime!: Date
  @Field()
  duration!: number
  @Field()
  prize!: number
  @Field(() => String, { nullable: true })
  image?: Buffer | null | undefined
  @Field()
  sport!: SportType
}

@InputType()
export class GetGameFilter {
  @Field({ nullable: true })
  tab?: GameTab
  @Field({ nullable: true })
  sport?: SportType
}

@InputType()
export class GetGameArgs {
  @Field({ nullable: true })
  filter?: GetGameFilter
  @Field({ nullable: true })
  pagination?: LimitOffset
}
