import argon from "argon2";

import { Arg, Field, Mutation, ObjectType, Resolver } from "type-graphql";
import { AdminWallet } from "../entities/AdminWallet";
import { User } from "../entities/User";

@ObjectType()
class FieldError {
  @Field()
  field?: string;
  @Field()
  message?: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];
  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class UserResolver {
  @Mutation(() => String)
  async addAdmin(@Arg("address") address: string): Promise<String> {
    await AdminWallet.create({
      address: await argon.hash(address),
    }).save();
    return "success";
  }
}
