import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Entity, ManyToOne, PrimaryGeneratedColumn, Relation } from "typeorm"

import { Asset } from "./Asset"
import { Athlete } from "./Athlete"
import { GameTeam } from "./GameTeam"

@ObjectType()
@Entity()
export class GameTeamAthlete extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => GameTeam)
  @ManyToOne(() => GameTeam, (team) => team.athletes)
  gameTeam!: Relation<GameTeam>

  // @Field(() => Asset)
  // @ManyToOne(() => Asset, (asset) => asset.gameTeamAthletes)
  // asset!: Relation<Asset>

  @Field(() => Athlete)
  @ManyToOne(() => Athlete, (athlete) => athlete.gameTeamAthletes)
  athlete!: Relation<Athlete>
}
