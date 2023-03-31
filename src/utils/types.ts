import { InputType, Field } from "type-graphql"

export enum SportType {
  MLB = "mlb",
  MLB_PROMO = "mlb-promo",
  NBA = "nba",
  NBA_PROMO = "nba-promo",
  NFL = "nfl",
  CRICKET = "cricket",
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
