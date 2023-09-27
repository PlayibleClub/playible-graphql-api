import { Field, ID, ObjectType, Int } from 'type-graphql';
import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { PolygonAddress } from './PolygonAddress';
import { SportType, TokenType } from '../utils/types';
@ObjectType()
@Entity()
export class PolygonToken extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => Int)
  @Column('integer')
  tokenId!: number;

  @Field(() => String)
  @Column({
    type: 'enum',
    enum: SportType,
    default: SportType.NFL,
  })
  sport: SportType = SportType.NFL;

  @Field(() => String)
  @Column({
    type: 'enum',
    enum: TokenType,
    default: TokenType.REG,
  })
  type: TokenType = TokenType.REG;

  @Field(() => PolygonAddress)
  @ManyToOne(() => PolygonAddress, (address) => address.tokens)
  polygonAddress!: Relation<PolygonAddress>;
}
