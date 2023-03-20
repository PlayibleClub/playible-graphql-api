import { SportType } from "../utils/types"
import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { CricketAthlete } from './CricketAthlete'
import { CricketTournament } from "./CricketTournament"

@ObjectType()
@Entity()
export class CricketTeam extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({type: "varchar", unique: true})
  key!: string

  @Field(() => String)
  @Column({type: "varchar"})
  name!: string

  @Field(() => CricketTournament)
  @ManyToOne(() => CricketTournament, (tournaments) => tournaments.cricketTeams)
  @JoinColumn({referencedColumnName: "key"})
  tournament!: Relation<CricketTournament>

  @Field(() => [CricketAthlete])
  @OneToMany(() => CricketAthlete, (cricketAthlete) => cricketAthlete.cricketTeam)
  athletes!: Relation<CricketAthlete>[]

  @Field(() => String)
  @Column({
    type: "enum",
    enum: SportType,
    default: SportType.CRICKET,
  })
  sport: SportType = SportType.CRICKET
}