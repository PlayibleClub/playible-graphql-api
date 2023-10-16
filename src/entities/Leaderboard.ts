import { Field, ID, Int, ObjectType } from 'type-graphql';
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
  Relation,
} from 'typeorm';
import { SportType } from '../utils/types';
import { GameTeam } from './GameTeam';
import { Game } from './Game';

@ObjectType()
@Entity()
export class Leaderboard extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => String)
  @Column({
    type: 'enum',
    enum: SportType,
    default: SportType.MLB,
  })
  sport: SportType = SportType.MLB;

  @Field(() => Number, { nullable: true })
  @OneToOne(() => Game, { cascade: true, nullable: true })
  @JoinColumn()
  nearGameId!: Relation<Game> | null;

  @Field(() => Number, { nullable: true })
  @OneToOne(() => Game, { cascade: true, nullable: true })
  @JoinColumn()
  polygonGameId?: Relation<Game> | null;
}
