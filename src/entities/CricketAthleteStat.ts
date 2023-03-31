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
  @ManyToOne(() => CricketMatch, (match) => match.stats, {nullable: true})
  @JoinColumn({referencedColumnName: "key"})
  match?: Relation<CricketMatch>

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
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_run?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_four?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_six?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_fifty_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_hundred_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_duck_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_wicket?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_four_wickets?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_five_wickets?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_maiden_over?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_catch?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_stumping?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_for_every_runout?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_economy_rate?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  cricket_strike_rate?: number
  //end fantasy score breakdown stats

  //start seasonal stats (batting)
  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  matches?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  not_outs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  batting_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  high_score?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  batting_average?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  batting_balls?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  batting_strike_rate?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  hundreds?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  fifties?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  fours?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  sixes?: number
  //end seasonal stats (batting)
  //start seasonal stats (fielding)

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  catches?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  stumpings?: number
  //end seasonal stats (fielding)
  //start seasonal stats (bowling)

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  bowling_balls?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  bowling_runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  wickets?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  bowling_average?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  economy?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  bowling_strike_rate?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  four_wickets?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0, nullable: true})
  five_wickets?: number
}
