import { Field, Float, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, Relation } from "typeorm"
import { NearResponse } from '../entities/NearResponse'
@ObjectType()
@Entity()
export class NearBlock extends BaseEntity{
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => Number)
  @Column("numeric", {nullable: false})
  height!: number

  @Field(() => String)
  @Column({ type: "varchar", length: 255 })
  hash!: string

  @Field(() => Date)
  @Column({ type: "timestamptz"})
  timestamp!: Date

  @Field(() => NearResponse)
  @ManyToOne(() => NearResponse, (response) => response.nearBlock, {cascade: true})
  nearResponse!: Relation<NearResponse>
}