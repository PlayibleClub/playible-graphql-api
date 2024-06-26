import { AthleteStatType } from "../utils/types"
import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation } from "typeorm"
import { Athlete } from "./Athlete"
import { Team } from "./Team"

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

  @Field(() => String, { nullable: true })
  @Column({ type: "varchar", length: 155, nullable: true })
  week?: string

  @Field(() => Team, { nullable: true })
  @ManyToOne(() => Team, (team) => team.statOpponents)
  opponent!: Relation<Team> | null

  @Field(() => Date, { nullable: true })
  @Column({ type: "timestamptz", nullable: true })
  gameDate?: Date

  @Field(() => String)
  @Column({
    type: "enum",
    enum: AthleteStatType,
    default: AthleteStatType.WEEKLY,
  })
  type: AthleteStatType = AthleteStatType.WEEKLY

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  position!: string

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  fantasyScore?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  played?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  statId?: number

  // START MLB

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  atBats?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  runs?: number

  @Field(() => Number)
  @Column({type: "numeric", default: 0})
  hits?: number

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
  battingAverage?: number

  @Field(() => Number)
  @Column({ type:"numeric", default: 0})
  strikeouts?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  walks?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  caughtStealing?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  onBasePercentage?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  sluggingPercentage?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  onBasePlusSlugging?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  wins?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  losses?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  saves?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0})
  earnedRunAverage?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  hitByPitch?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  stolenBases?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  walksHitsPerInningsPitched?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingBattingAverageAgainst?: number
  
  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingHits?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingRuns?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingEarnedRuns?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingWalks?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingHomeRuns?: number

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingTotalInningsPitched?: number //not in sportsdata

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingStrikeouts?: number


  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingHitsAllowed?: number //not in sportsdata

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingWalksAllowed?: number //not in sportsdata

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingEarnedRunsAllowed?: number // not in sportsdata

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  pitchingHitsByPitchAllowed?: number //not in sportsdata

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

  // START NBA
  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  points?: number // Points

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  rebounds?: number // Rebounds

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  offensiveRebounds?: number // OffensiveRebounds

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  defensiveRebounds?: number // DefensiveRebounds

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  assists?: number // Assists

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  steals?: number // Steals

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  blockedShots?: number // BlockedShots

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  turnovers?: number // Turnovers

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  personalFouls?: number // PersonalFouls

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  fieldGoalsMade?: number // FieldGoalsMade

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  fieldGoalsAttempted?: number // FieldGoalsAttempted

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  fieldGoalsPercentage?: number // FieldGoalsPercentage

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  threePointersMade?: number // ThreePointersMade

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  threePointersAttempted?: number // ThreePointersAttempted

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  threePointersPercentage?: number // ThreePointersPercentage

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  freeThrowsMade?: number // FreeThrowsMade

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  freeThrowsAttempted?: number // FreeThrowsAttempted

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  freeThrowsPercentage?: number // FreeThrowsPercentage

  @Field(() => Number)
  @Column({ type: "numeric", default: 0 })
  minutes?: number // Minutes
  // END NBA
}
