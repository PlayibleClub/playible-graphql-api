import { Field, Float, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { AthleteStat } from "./AthleteStat"
import { GameTeamAthlete } from "./GameTeamAthlete"
import { Team } from "./Team"

@ObjectType()
@Entity()
export class Athlete extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => ID)
  @Column("integer", { unique: true })
  apiId!: number

  @Field(() => String, {nullable: true})
  @Column({ type: "varchar", length: 50, nullable: true})
  playerKey!: string //for cricket

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  firstName!: string

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  lastName!: string

  @Field(() => String)
  @Column({ type: "varchar" })
  position!: string

  @Field(() => Int, { nullable: true })
  @Column("integer", { nullable: true })
  jersey?: number | null

  @Field(() => Team)
  @ManyToOne(() => Team, (team) => team.athletes)
  team!: Relation<Team>

  @Field(() => Float, { nullable: true })
  @Column("numeric", { nullable: true })
  salary?: number | null

  @Field(() => Boolean, { defaultValue: true })
  @Column({ type: "boolean", default: true })
  isActive: boolean = true

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  isInjured?: string

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  playerHeadshot?: string
 
  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  nftImage?: string

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  nftImagePromo?: string

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  nftImageLocked?: string

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  nftAnimation?: string

  @Field(() => String, { nullable: true})
  @Column({ type: "text", nullable: true})
  cid?: string

  @Field(() => [GameTeamAthlete])
  @OneToMany(() => GameTeamAthlete, (gameTeamAthlete) => gameTeamAthlete.athlete, {
    cascade: true,
  })
  gameTeamAthletes!: Relation<GameTeamAthlete>[]

  @Field(() => [AthleteStat])
  @OneToMany(() => AthleteStat, (stat) => stat.athlete, {
    cascade: true,
  })
  stats!: Relation<AthleteStat>[]
}
