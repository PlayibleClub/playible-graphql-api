import { Field, ID, ObjectType } from 'type-graphql';
import {
  BaseEntity,
  Entity,
  Column,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { SportType, TokenType } from '../utils/types';
import { Asset } from './Asset';
import { Athlete } from './Athlete';
import { GameTeam } from './GameTeam';

@ObjectType()
@Entity()
export class GameTeamAthlete extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => String)
  @Column('text')
  token_id!: string;

  @Field(() => String)
  @Column({
    type: 'enum',
    enum: TokenType,
    default: TokenType.REG,
  })
  type: TokenType = TokenType.REG;

  @Field(() => GameTeam)
  @ManyToOne(() => GameTeam, (team) => team.athletes, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  gameTeam!: Relation<GameTeam>;

  // @Field(() => Asset)
  // @ManyToOne(() => Asset, (asset) => asset.gameTeamAthletes)
  // asset!: Relation<Asset>

  @Field(() => Athlete)
  @ManyToOne(() => Athlete, (athlete) => athlete.gameTeamAthletes)
  athlete!: Relation<Athlete>;
}
