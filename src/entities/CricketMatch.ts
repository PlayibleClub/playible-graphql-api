import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { CricketTournament } from "./CricketTournament"
import { CricketAthleteStat } from './CricketAthleteStat' 
@ObjectType()
@Entity()
export class CricketMatch extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({ type: "varchar", unique: true})
  key!: string

  @Field(() => String, { nullable: true })
  @Column({ type: "varchar", nullable: true})
  name?: string

  @Field(() => String, { nullable: true })
  @Column({ type: "varchar", nullable: true})
  status?: string

  @Field(() => Date, { nullable: false})
  @Column({ type: "timestamptz", nullable: false})
  start_at!: Date

  @Field(() => CricketTournament)
  @ManyToOne(() => CricketTournament, (tournament) => tournament.cricketMatches, {cascade: true})
  @JoinColumn({referencedColumnName: "key"})
  tournament!: Relation<CricketTournament>

  @Field(() => [CricketAthleteStat])
  @OneToMany(() => CricketAthleteStat, (stats) => stats.match, { cascade: true})
  stats!: Relation<CricketAthleteStat>[]
}