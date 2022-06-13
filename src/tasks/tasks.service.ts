import { Injectable, Logger } from "@nestjs/common"
import { Cron, Interval, Timeout } from "@nestjs/schedule"
import axios from "axios"

import { Team } from "../entities/Team"
import { Athlete } from "../entities/Athlete"
import { SportType } from "../utils/types"

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name)

  // @Cron("45 * * * * *")
  // handleCron() {
  //   this.logger.debug("Called when the second is 45")
  // }

  // @Interval(10000)
  // handleInterval() {
  //   this.logger.debug("Called every 10 seconds")
  // }

  @Timeout(1)
  async syncMlbData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.MLB },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}mlb/scores/json/teams?key=${process.env.SPORTS_DATA_KEY}`
      )

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["TeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.MLB,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("MLB Teams Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(
      `MLB Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`
    )

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.MLB } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_KEY}`
      )

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOneOrFail({
              where: { apiId: athlete["TeamID"] },
            })

            await Athlete.create({
              apiId: athlete["PlayerID"],
              firstName: athlete["FirstName"],
              lastName: athlete["LastName"],
              position: athlete["Position"],
              salary: athlete["Salary"],
              jersey: athlete["Jersey"],
              team,
              isActive: athlete["Status"] === "Active",
              isInjured: athlete["InjuryStatus"] !== null,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("MLB Athletes Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(
      `MLB Athletes Data: ${
        athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"
      }`
    )
  }
}
