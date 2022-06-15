import { Field, ID, ObjectType } from "type-graphql"
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm"
import { Asset } from "./Asset"

@ObjectType()
@Entity()
export class Collection extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column("text", { unique: true })
  address!: string

  @Field(() => [Asset])
  @OneToMany(() => Asset, (asset) => asset.collection, {
    cascade: true,
  })
  assets!: Relation<Asset>[]
}
