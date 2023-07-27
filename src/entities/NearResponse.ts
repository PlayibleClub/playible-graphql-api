import { Field, Float, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, Relation } from "typeorm"
import { NearBlock } from '../entities/NearBlock'
@ObjectType()
@Entity()
export class NearResponse extends BaseEntity{

  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({ type: "varchar", length: 255})
  transactionHash!: string
  
  @Field(() => String)
  @Column({ type: "varchar", length: 64})
  receiverId!: string

  @Field(() => String)
  @Column({ type: "varchar", length: 64})
  signerId!: string

  @Field(() => [String])
  @Column({ type: "varchar", length: 255, nullable: true, array: true})
  receiptId?: string[]

  @Field(() => String)
  @Column({ type: "varchar", length: 50, nullable: true})
  methodName?: string

  @Field(() => String)
  @Column({ type: "text", nullable: true})
  methodArgs?: string

  @Field(() => String)
  @Column({ type: "text"})
  status!: string //from RPC API

  @Field(() => NearBlock)
  @OneToOne(() => NearBlock, (block) => block.nearResponse)
  nearBlock!: Relation<NearBlock>
}