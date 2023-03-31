import { SportType } from "../utils/types"
import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { CricketAthlete } from './CricketAthlete'
import { CricketTournament } from "./CricketTournament"
import { CricketMatch } from './CricketMatch'
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
  @ManyToOne(() => CricketTournament, (tournament) => tournament.cricketTeams)
  @JoinColumn({referencedColumnName: "key"})
  tournament!: Relation<CricketTournament>

  @Field(() => [CricketAthlete])
  @OneToMany(() => CricketAthlete, (cricketAthlete) => cricketAthlete.cricketTeam, {cascade: true})
  athletes!: Relation<CricketAthlete>[]

  @Field(() => [CricketMatch])
  @OneToMany(() => CricketMatch, (matches) => matches.team_a, {nullable: true})
  @JoinColumn({referencedColumnName: 'team_a'})
  team_a_matches?: Relation<CricketMatch>[]

  @Field(() => [CricketMatch])
  @OneToMany(() => CricketMatch, (matches) => matches.team_b, { nullable: true})
  @JoinColumn({referencedColumnName: 'team_b'})
  team_b_matches?: Relation<CricketMatch>[]

  @Field(() => String)
  @Column({
    type: "enum",
    enum: SportType,
    default: SportType.CRICKET,
  })
  sport: SportType = SportType.CRICKET
}