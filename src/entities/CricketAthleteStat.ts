import { AthleteStatType } from '../utils/types'
import { Field, ID, ObjectType } from 'type-graphql'
import { BaseEntity, Column, Entity, ManyToOne, PrimaryGeneratedColumn, Relation, JoinColumn } from 'typeorm'
import { CricketAthlete } from './CricketAthlete'
import { CricketMatch } from './CricketMatch'

@ObjectType()
@Entity()
export class CricketAthleteStat extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => CricketAthlete)
  @ManyToOne(() => CricketAthlete, (cricketAthlete) => cricketAthlete.stats)
  @JoinColumn({referencedColumnName: "playerKey"})
  athlete!: Relation<CricketAthlete>

  @Field(() => CricketMatch)
  @ManyToOne(() => CricketMatch, (match) => match.stats)
  @JoinColumn({referencedColumnName: "key"})
  match!: Relation<CricketMatch>

  @Field(() => String)
  @Column({
    type: "enum",
    enum: AthleteStatType,
    default: AthleteStatType.DAILY,
  })
  type: AthleteStatType = AthleteStatType.DAILY
  
  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  fantasyScore?: number

  //start cricket fantasy score breakdown stats
  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_run?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_four?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_six?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_fifty_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_hundred_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_duck_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_wicket?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_four_wickets?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_five_wickets?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_maiden_over?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_catch?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_stumping?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_for_every_runout?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_economy_rate?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  cricket_strike_rate?: number

}
