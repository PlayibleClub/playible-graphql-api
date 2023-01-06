import { InputType, Field } from "type-graphql"

export enum SportType {
  MLB = "mlb",
  NBA = "nba",
  NBA_PROMO = "nba-promo",
  NFL = "nfl",
}

export enum AthleteStatType {
  WEEKLY = "weekly",
  SEASON = "season",
  DAILY = "daily",
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
