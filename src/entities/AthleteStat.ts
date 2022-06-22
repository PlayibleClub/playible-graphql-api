import { Field, ID, ObjectType } from "type-graphql"
import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm"
import { Athlete } from "./Athlete"

@ObjectType()
@Entity()
export class AthleteStat extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => Athlete)
  @ManyToOne(() => Athlete, (athlete) => athlete.stats)
  athlete!: Relation<Athlete>

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  season!: string

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  position!: string

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  fantasyScore?: number

  // START MLB
  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  singles?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  doubles?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  triples?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  homeRuns?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  runsBattedIn?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  walks?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  hitByPitch?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  stolenBases?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingTotalInningsPitched?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingStrikeouts?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingHitsAllowed?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingWalksAllowed?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingEarnedRunsAllowed?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingHitsByPitchAllowed?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingCompleteGames?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingShutouts?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingNoHitters?: number
  // END MLB

  // START NFL
  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  completion?: number // PassingCompletionPercentage

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  carries?: number // RushingAttempts

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  passingYards?: number // PassingYards

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  rushingYards?: number // RushingYards

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  receivingYards?: number // ReceivingYards

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  passingTouchdowns?: number // PassingTouchdowns

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  interceptions?: number // PassingInterceptions

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  rushingTouchdowns?: number // RushingTouchdowns

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  receivingTouchdowns?: number // ReceivingTouchdowns

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  targets?: number // ReceivingTargets

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  receptions?: number // Receptions
  // END NFL
}
