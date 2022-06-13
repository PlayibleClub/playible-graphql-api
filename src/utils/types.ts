import { InputType, Field } from "type-graphql"

export enum SportType {
  MLB = "mlb",
  NBA = "nba",
  NFL = "nfl",
}

export enum GameTab {
  NEW = "new",
  ACTIVE = "active",
  COMPLETED = "completed",
}

@InputType()
export class LimitOffset {
  @Field({ nullable: true })
  limit?: number
  @Field({ nullable: true })
  offset?: number
}
