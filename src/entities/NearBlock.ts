import { Field, Float, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"

@ObjectType()
@Entity()
export class NearBlock extends BaseEntity{
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => Number)
  @Column("numeric", {nullable: false})
  height!: number

  @Field(() => Date)
  @Column({ type: "timestamptz"})
  timestamp!: Date
}