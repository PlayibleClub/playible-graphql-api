import { SportType } from "../utils/types"
import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToMany, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { CricketAthlete } from './CricketAthlete'
import { CricketTournament } from "./CricketTournament"

@ObjectType()
@Entity()
export class CricketTeam extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({type: "varchar"})
  key!: string

  @Field(() => String)
  @Column({type: "varchar"})
  name!: string

  @Field(() => [CricketTournament])
  @ManyToMany(() => CricketTournament, (tournaments) => tournaments.cricketTeams)
  tournaments!: Relation<CricketTournament>[]

  @Field(() => [CricketAthlete])
  @OneToMany(() => CricketAthlete, (cricketAthlete) => cricketAthlete.cricketTeam)
  athletes!: Relation<CricketAthlete>[]
}