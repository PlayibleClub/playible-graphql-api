import { Injectable, Logger } from "@nestjs/common"
import { Cron, Interval, Timeout } from "@nestjs/schedule"
import S3 from "aws-sdk/clients/s3"
import axios from "axios"
import fs from "fs"
import { LessThanOrEqual, MoreThanOrEqual, Equal, Not } from "typeorm"
import convert from "xml-js"
import moment from "moment"

import { Athlete } from "../entities/Athlete"
import { AthleteStat } from "../entities/AthleteStat"
import { Game } from "../entities/Game"
import { GameTeam } from "../entities/GameTeam"
import { Team } from "../entities/Team"
import { Timeframe } from "../entities/Timeframe"
import { Schedule } from "../entities/Schedule"

import { getSeasonType } from "../helpers/Timeframe"
import { ATHLETE_MLB_BASE_ANIMATION, ATHLETE_MLB_BASE_IMG, ATHLETE_MLB_IMG } from "../utils/svgTemplates"
import { AthleteStatType, SportType } from "../utils/types"
import e from "express"

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name)

  async testAnimation() {
    const athlete = await Athlete.findOneOrFail({
      where: { id: 1 },
      relations: { team: true },
    })
    const baseImage = ATHLETE_MLB_BASE_IMG
    var options = { compact: true, ignoreComment: true, spaces: 4 }
    var result: any = convert.xml2js(baseImage, options)
    console.log(result["svg"]["g"]["4"]["g"][3]["text"][0]["tspan"]["_cdata"]) // First name
    console.log(result["svg"]["g"]["4"]["g"][3]["g"]["text"][0]["tspan"]["_cdata"]) // First name

    console.log(result["svg"]["g"][4]["g"][3]["text"][1]["tspan"]["_cdata"]) // Last name
    console.log(result["svg"]["g"][4]["g"][3]["g"]["text"][1]["tspan"]["_cdata"]) // Last name

    console.log(result["svg"]["g"][1]["g"][2]["g"]["path"]["_attributes"]["fill"]) // Primary color
    console.log(result["svg"]["g"][1]["g"][0]["g"]["path"]["_attributes"]["fill"]) // Secondary color

    console.log(result["svg"]["g"][4]["g"][2]["g"]["text"]["tspan"]["_cdata"]) // Jersey
    console.log(result["svg"]["g"][4]["g"][0]["g"]["g"]["text"]["tspan"]["_cdata"]) // Position

    result["svg"]["g"]["4"]["g"][3]["text"][0]["tspan"]["_cdata"] = athlete.firstName
    result["svg"]["g"]["4"]["g"][3]["g"]["text"][0]["tspan"]["_cdata"] = athlete.firstName
    result["svg"]["g"][4]["g"][3]["text"][1]["tspan"]["_cdata"] = athlete.lastName
    result["svg"]["g"][4]["g"][3]["g"]["text"][1]["tspan"]["_cdata"] = athlete.lastName
    result["svg"]["g"][1]["g"][2]["g"]["path"]["_attributes"]["fill"] = athlete.team.primaryColor
    result["svg"]["g"][1]["g"][0]["g"]["path"]["_attributes"]["fill"] = athlete.team.secondaryColor
    result["svg"]["g"][4]["g"][2]["g"]["text"]["tspan"]["_cdata"] = athlete.jersey ? athlete.jersey.toString() : "00"
    result["svg"]["g"][4]["g"][0]["g"]["g"]["text"]["tspan"]["_cdata"] = athlete.position

    const animation = convert.js2xml(result, options)
    result = animation.replace("</svg>", ATHLETE_MLB_BASE_ANIMATION)
    // fs.writeFileSync("./testAthleteAnimation.svg", result)
  }

  // @Timeout(1)
  async syncMlbData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.MLB },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/teams?key=${process.env.SPORTS_DATA_MLB_KEY}`)

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
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

    this.logger.debug(`MLB Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.MLB } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`)

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOneOrFail({
              where: { apiId: athlete["GlobalTeamID"] },
            })

            var options = { compact: true, ignoreComment: true, spaces: 4 }
            var result: any = convert.xml2js(ATHLETE_MLB_IMG, options)

            result.svg.path[10]["_attributes"]["fill"] = team.primaryColor
            result.svg.path[9]["_attributes"]["fill"] = team.secondaryColor
            result.svg.g[0].text[0]["_text"] = athlete["FirstName"].toUpperCase()
            result.svg.g[0].text[1]["_text"] = athlete["LastName"].toUpperCase()
            result.svg.g[0].text[2]["_text"] = athlete["Position"].toUpperCase()
            result.svg.text["_text"] = athlete["Jersey"] ? athlete["Jersey"] : "00"

            result = convert.js2xml(result, options)
            var buffer = Buffer.from(result, "utf8")
            const s3 = new S3({
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            })
            const filename = `${athlete["PlayerID"]}.svg`
            const s3_location = "media/athlete/mlb/"
            const fileContent = buffer
            const params: any = {
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: `${s3_location}${filename}`,
              Body: fileContent,
              ContentType: "image/svg+xml",
              CacheControl: "no-cache",
            }

            s3.upload(params, async (err: any, data: any) => {
              if (err) {
                this.logger.error(err)
              } else {
                const nftImage = data["Location"]

                const baseImage = ATHLETE_MLB_BASE_IMG
                var options = { compact: true, ignoreComment: true, spaces: 4 }
                var result: any = convert.xml2js(baseImage, options)

                result["svg"]["g"]["4"]["g"][3]["text"][0]["tspan"]["_cdata"] = athlete["FirstName"].toUpperCase()
                result["svg"]["g"]["4"]["g"][3]["g"]["text"][0]["tspan"]["_cdata"] = athlete["FirstName"].toUpperCase()
                result["svg"]["g"][4]["g"][3]["text"][1]["tspan"]["_cdata"] = athlete["LastName"].toUpperCase()
                result["svg"]["g"][4]["g"][3]["g"]["text"][1]["tspan"]["_cdata"] = athlete["LastName"].toUpperCase()
                result["svg"]["g"][1]["g"][2]["g"]["path"]["_attributes"]["fill"] = team.primaryColor
                result["svg"]["g"][1]["g"][0]["g"]["path"]["_attributes"]["fill"] = team.secondaryColor
                result["svg"]["g"][4]["g"][2]["g"]["text"]["tspan"]["_cdata"] = athlete["Jersey"] ? athlete["Jersey"].toString() : "00"
                result["svg"]["g"][4]["g"][0]["g"]["g"]["text"]["tspan"]["_cdata"] = athlete["Position"].toUpperCase()

                const animation = convert.js2xml(result, options)
                result = animation.replace("</svg>", ATHLETE_MLB_BASE_ANIMATION)
                var buffer = Buffer.from(result, "utf8")
                const s3 = new S3({
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                })
                const filename = `${athlete["PlayerID"]}.svg`
                const s3_location = "media/athlete_animations/mlb/"
                const fileContent = buffer
                const params: any = {
                  Bucket: process.env.AWS_BUCKET_NAME,
                  Key: `${s3_location}${filename}`,
                  Body: fileContent,
                  ContentType: "image/svg+xml",
                  CacheControl: "no-cache",
                }

                s3.upload(params, async (err: any, data: any) => {
                  if (err) {
                    this.logger.error(err)
                  } else {
                    await Athlete.create({
                      apiId: athlete["PlayerID"],
                      firstName: athlete["FirstName"],
                      lastName: athlete["LastName"],
                      position: athlete["Position"],
                      salary: athlete["Salary"],
                      jersey: athlete["Jersey"],
                      team,
                      isActive: athlete["Status"] === "Active",
                      isInjured: athlete["InjuryStatus"],
                      nftImage,
                      nftAnimation: data["Location"],
                    }).save()
                  }
                })
              }
            })
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("MLB Athletes Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`MLB Athletes Data: ${athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)
  }

  @Timeout(1)
  async syncNflData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.NFL },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Teams?key=${process.env.SPORTS_DATA_NFL_KEY}`)

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.NFL,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("NFL Teams Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`NFL Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.NFL } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`)

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOne({
              where: { apiId: athlete["GlobalTeamID"] },
            })

            if (team) {
              var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-templates/${team.key}.svg`, "utf-8")
              var options = { compact: true, ignoreComment: true, spaces: 4 }
              var result: any = convert.xml2js(svgTemplate, options)

              try {
                result.svg.g[5].text[2]["_text"] = athlete["FirstName"].toUpperCase()
                result.svg.g[5].text[3]["_text"] = athlete["LastName"].toUpperCase()
                result.svg.g[5].text[1]["_text"] = athlete["Position"].toUpperCase()
                result.svg.g[5].text[0]["_text"] = ""
              } catch (e) {
                console.log(`FAILED AT ATHLETE ID: ${athlete["PlayerID"]} and TEAM KEY: ${team.key}`)
              }

              result = convert.js2xml(result, options)
              // fs.writeFileSync(
              //   `./nfl-images/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
              //     "LastName"
              //   ].toLowerCase()}.svg`,
              //   result
              // )
              var buffer = Buffer.from(result, "utf8")
              const s3 = new S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              })
              const filename = `${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete["LastName"].toLowerCase()}.svg`
              const s3_location = "media/athlete/nfl/images/"
              const fileContent = buffer
              const params: any = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `${s3_location}${filename}`,
                Body: fileContent,
                ContentType: "image/svg+xml",
                CacheControl: "no-cache",
              }

              s3.upload(params, async (err: any, data: any) => {
                if (err) {
                  this.logger.error(err)
                } else {
                  const nftImage = data["Location"]

                  var svgAnimationTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-animation-templates/${team.key}.svg`, "utf-8")
                  var options = { compact: true, ignoreComment: true, spaces: 4 }
                  var result: any = convert.xml2js(svgAnimationTemplate, options)

                  try {
                    result.svg.g[5].text[0].tspan["_cdata"] = ""
                    result.svg.g[5].text[1].tspan["_cdata"] = ""
                    result.svg.g[5].text[2].tspan["_cdata"] = athlete["FirstName"].toUpperCase()
                    result.svg.g[5].text[3].tspan["_cdata"] = athlete["FirstName"].toUpperCase()
                    result.svg.g[5].text[4].tspan["_cdata"] = athlete["LastName"].toUpperCase()
                    result.svg.g[5].text[5].tspan["_cdata"] = athlete["LastName"].toUpperCase()
                    result.svg.g[5].g[0].text[0].tspan["_cdata"] = athlete["Position"].toUpperCase()
                    result.svg.g[5].g[0].text[1].tspan["_cdata"] = athlete["Position"].toUpperCase()
                    result = convert.js2xml(result, options)
                  } catch (e) {
                    console.log(`FAILED AT ATHLETE ID: ${athlete["PlayerID"]} and TEAM KEY: ${team.key}`)
                    console.log(e)
                  }

                  // fs.writeFileSync(
                  //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
                  //     "LastName"
                  //   ].toLowerCase()}.svg`,
                  //   result
                  // )
                  var buffer = Buffer.from(result, "utf8")
                  const s3 = new S3({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                  })
                  const filename = `${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete["LastName"].toLowerCase()}.svg`
                  const s3_location = "media/athlete/nfl/animations/"
                  const fileContent = buffer
                  const params: any = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `${s3_location}${filename}`,
                    Body: fileContent,
                    ContentType: "image/svg+xml",
                    CacheControl: "no-cache",
                  }

                  s3.upload(params, async (err: any, data: any) => {
                    if (err) {
                      this.logger.error(err)
                    } else {
                      await Athlete.create({
                        apiId: athlete["PlayerID"],
                        firstName: athlete["FirstName"],
                        lastName: athlete["LastName"],
                        position: athlete["Position"],
                        jersey: athlete["Number"],
                        team,
                        isActive: athlete["Status"] === "Active",
                        isInjured: athlete["InjuryStatus"],
                        nftImage,
                        nftAnimation: data["Location"],
                      }).save()
                    }
                  })
                }
              })
            }
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("NFL Athletes Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`NFL Athletes Data: ${athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)
  }

  @Timeout(1)
  async syncNbaData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.NBA },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/AllTeams?key=${process.env.SPORTS_DATA_NBA_KEY}`)

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.NBA,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("NBA Teams Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`NBA Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.NBA } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`)

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOne({
              where: { apiId: athlete["GlobalTeamID"] },
            })

            if (team) {
              await Athlete.create({
                apiId: athlete["PlayerID"],
                firstName: athlete["FirstName"],
                lastName: athlete["LastName"],
                position: athlete["Position"],
                jersey: athlete["Jersey"],
                team,
                isActive: athlete["Status"] === "Active",
                isInjured: athlete["InjuryStatus"],
              }).save()
            }
          } catch (e) {
            this.logger.error(e)
          }
        }
      }
    }

    this.logger.debug(`NBA Athletes Data: ${athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)
  }

  // @Timeout(1)
  async generateAthleteNflAssets() {
    this.logger.debug("Generate Athlete NFL Assets: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[3]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[5].text[2]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[5].text[3]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[5].text[1]["_text"] = athlete.position.toUpperCase()
        result.svg.g[5].text[0]["_text"] = ""
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nfl-images/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
      //     "LastName"
      //   ].toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nfl/images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          const nftImage = data["Location"]
          athlete.nftImage = nftImage

          var svgAnimationTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-animation-templates/${athlete.team.key}.svg`, "utf-8")
          var options = { compact: true, ignoreComment: true, spaces: 4 }
          var result: any = convert.xml2js(svgAnimationTemplate, options)

          try {
            if (athlete.firstName.length > 11) {
              result.svg.g[5].text[2].tspan["_attributes"]["font-size"] = "50"
              result.svg.g[5].text[3].tspan["_attributes"]["font-size"] = "50"
            }
            if (athlete.lastName.length > 11) {
              result.svg.g[5].text[4].tspan["_attributes"]["font-size"] = "50"
              result.svg.g[5].text[5].tspan["_attributes"]["font-size"] = "50"
            }

            result.svg.g[5].text[0].tspan["_cdata"] = ""
            result.svg.g[5].text[1].tspan["_cdata"] = ""
            result.svg.g[5].text[2].tspan["_cdata"] = athlete.firstName.toUpperCase()
            result.svg.g[5].text[3].tspan["_cdata"] = athlete.firstName.toUpperCase()
            result.svg.g[5].text[4].tspan["_cdata"] = athlete.lastName.toUpperCase()
            result.svg.g[5].text[5].tspan["_cdata"] = athlete.lastName.toUpperCase()
            result.svg.g[5].g[0].text[0].tspan["_cdata"] = athlete.position.toUpperCase()
            result.svg.g[5].g[0].text[1].tspan["_cdata"] = athlete.position.toUpperCase()
            result = convert.js2xml(result, options)
          } catch (e) {
            console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
            console.log(e)
          }

          // fs.writeFileSync(
          //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
          //     "LastName"
          //   ].toLowerCase()}.svg`,
          //   result
          // )
          var buffer = Buffer.from(result, "utf8")
          const s3 = new S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          })
          const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
          const s3_location = "media/athlete/nfl/animations/"
          const fileContent = buffer
          const params: any = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${s3_location}${filename}`,
            Body: fileContent,
            ContentType: "image/svg+xml",
            CacheControl: "no-cache",
          }

          s3.upload(params, async (err: any, data: any) => {
            if (err) {
              this.logger.error(err)
            } else {
              athlete.nftAnimation = data["Location"]
              await Athlete.save(athlete)
            }
          })
        }
      })
    }

    this.logger.debug("Generate Athlete NFL Assets: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssets() {
    this.logger.debug("Generate Athlete NBA Assets: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")

      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImage = data["Location"]

          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssetsAnimation() {
    this.logger.debug("Generate Athlete NBA Assets Animation: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-animation-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgAnimationTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[4].text[2].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[3].tspan["_attributes"]["font-size"] = "50"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[4].text[4].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[5].tspan["_attributes"]["font-size"] = "50"
        }

        result.svg.g[4].text[0].tspan["_text"] = athlete.position.toUpperCase()
        result.svg.g[4].text[1].tspan["_text"] = athlete.position.toUpperCase()
        result.svg.g[4].text[2].tspan["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[4].text[3].tspan["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[4].text[4].tspan["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[4].text[5].tspan["_text"] = athlete.lastName.toUpperCase()
        result = convert.js2xml(result, options)
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
        console.log(e)
      }

      // fs.writeFileSync(
      //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
      //     "LastName"
      //   ].toLowerCase()}.svg`,
      //   result
      // )
      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/animations/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftAnimation = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets Animations: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssetsPromo() {
    this.logger.debug("Generate Athlete NBA Assets Promo: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-promo-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/promo_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImagePromo = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets Promo: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNflAssetsPromo() {
    this.logger.debug("Generate Athlete NFL Assets Promo: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-promo-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[1]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[2]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }

        result.svg.g[5]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[5]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[5]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nfl-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nfl/promo_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImagePromo = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NFL Assets Promo: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNflAssetsLocked() {
    this.logger.debug("Generate Athlete NFL Assets Locked: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-lock-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[1]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[2]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }

        result.svg.g[5]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[5]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[5]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nfl-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nfl/locked_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImageLocked = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NFL Assets Locked: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssetsLocked() {
    this.logger.debug("Generate Athlete NBA Assets Locked: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-lock-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/locked_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImageLocked = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets Locked: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  @Interval(900000) // Runs every 15 mins
  async updateNflAthleteStatsPerSeason() {
    this.logger.debug("Update NFL Athlete Stats: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        const season = timeFrame.ApiSeason

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        )

        if (status === 200) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const numberOfGames: number = athleteStat["Played"] > 0 ? athleteStat["Played"] : 1
            const curStat = await AthleteStat.findOne({
              where: { athlete: { apiId }, season: season.toString(), type: AthleteStatType.SEASON },
              relations: {
                athlete: true,
              },
            })

            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"] / numberOfGames
              curStat.completion = athleteStat["PassingCompletionPercentage"] / numberOfGames
              curStat.carries = athleteStat["RushingAttempts"] / numberOfGames
              curStat.passingYards = athleteStat["PassingYards"] / numberOfGames
              curStat.rushingYards = athleteStat["RushingYards"] / numberOfGames
              curStat.receivingYards = athleteStat["ReceivingYards"] / numberOfGames
              curStat.interceptions = athleteStat["PassingInterceptions"] / numberOfGames
              curStat.passingTouchdowns = athleteStat["PassingTouchdowns"] / numberOfGames
              curStat.rushingTouchdowns = athleteStat["RushingTouchdowns"] / numberOfGames
              curStat.receivingTouchdowns = athleteStat["ReceivingTouchdowns"] / numberOfGames
              curStat.targets = athleteStat["ReceivingTargets"] / numberOfGames
              curStat.receptions = athleteStat["Receptions"] / numberOfGames
              curStat.played = athleteStat["Played"]
              updateStats.push(curStat)
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              })

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season.toString(),
                    type: AthleteStatType.SEASON,
                    position: athleteStat["Position"],
                    played: athleteStat["Played"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"] / numberOfGames,
                    completion: athleteStat["PassingCompletionPercentage"] / numberOfGames,
                    carries: athleteStat["RushingAttempts"] / numberOfGames,
                    passingYards: athleteStat["PassingYards"] / numberOfGames,
                    rushingYards: athleteStat["RushingYards"] / numberOfGames,
                    receivingYards: athleteStat["ReceivingYards"] / numberOfGames,
                    passingTouchdowns: athleteStat["PassingTouchdowns"] / numberOfGames,
                    interceptions: athleteStat["PassingInterceptions"] / numberOfGames,
                    rushingTouchdowns: athleteStat["RushingTouchdowns"] / numberOfGames,
                    receivingTouchdowns: athleteStat["ReceivingTouchdowns"] / numberOfGames,
                    targets: athleteStat["ReceivingTargets"] / numberOfGames,
                    receptions: athleteStat["Receptions"] / numberOfGames,
                  })
                )
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

          this.logger.debug("Update NFL Athlete Stats: FINISHED")
        } else {
          this.logger.error("NFL Athlete Stats Data: SPORTS DATA ERROR")
        }
      }
    } else {
      this.logger.error("NFL Timeframes Data: SPORTS DATA ERROR")
    }
  }

  @Interval(300000) // Runs every 5 mins
  async updateNflAthleteStatsPerWeek() {
    this.logger.debug("Update NFL Athlete Stats Per Week: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        const season = timeFrame.ApiSeason
        const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : "1"

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${week}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        )

        if (status === 200) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const curStat = await AthleteStat.findOne({
              where: { athlete: { apiId }, season: season, week: week, type: AthleteStatType.WEEKLY },
              relations: {
                athlete: true,
              },
            })

            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
              curStat.completion = athleteStat["PassingCompletionPercentage"]
              curStat.carries = athleteStat["RushingAttempts"]
              curStat.passingYards = athleteStat["PassingYards"]
              curStat.rushingYards = athleteStat["RushingYards"]
              curStat.receivingYards = athleteStat["ReceivingYards"]
              curStat.interceptions = athleteStat["PassingInterceptions"]
              curStat.passingTouchdowns = athleteStat["PassingTouchdowns"]
              curStat.rushingTouchdowns = athleteStat["RushingTouchdowns"]
              curStat.receivingTouchdowns = athleteStat["ReceivingTouchdowns"]
              curStat.targets = athleteStat["ReceivingTargets"]
              curStat.receptions = athleteStat["Receptions"]
              curStat.played = athleteStat["Played"]
              updateStats.push(curStat)
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              })

              const opponent = await Team.findOne({
                where: { key: athleteStat["Opponent"] },
              })

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season,
                    week: week,
                    opponent: opponent,
                    gameDate: new Date(athleteStat["GameDate"]),
                    type: AthleteStatType.WEEKLY,
                    played: athleteStat["Played"],
                    position: athleteStat["Position"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"],
                    completion: athleteStat["PassingCompletionPercentage"],
                    carries: athleteStat["RushingAttempts"],
                    passingYards: athleteStat["PassingYards"],
                    rushingYards: athleteStat["RushingYards"],
                    receivingYards: athleteStat["ReceivingYards"],
                    passingTouchdowns: athleteStat["PassingTouchdowns"],
                    interceptions: athleteStat["PassingInterceptions"],
                    rushingTouchdowns: athleteStat["RushingTouchdowns"],
                    receivingTouchdowns: athleteStat["ReceivingTouchdowns"],
                    targets: athleteStat["ReceivingTargets"],
                    receptions: athleteStat["Receptions"],
                  })
                )
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

          this.logger.debug("Update NFL Athlete Stats Per Week: FINISHED")
        } else {
          this.logger.error("NFL Athlete Stats Data: SPORTS DATA ERROR")
        }
      }
    } else {
      this.logger.error("NFL Timeframes Data: SPORTS DATA ERROR")
    }
  }
  @Interval(3600000) //runs every 1 hour
  async updateNflAthleteInjuryStatus(){
    this.logger.debug("Update NFL Athlete Injury Status: STARTED")

    const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (status === 200){
      const updateAthlete: Athlete[] = []
      for (let athlete of data){
        const apiId: number = athlete["PlayerID"]
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId },
        })

        if (curAthlete){
          curAthlete.isInjured = athlete["InjuryStatus"]
          updateAthlete.push(curAthlete)
        } 

        await Athlete.save(updateAthlete, {chunk: 20})

        
      }
      this.logger.debug("Update NFL Injury Status: FINISHED")
    } else{
      this.logger.error("NFL Athlete Injury Data: SPORTS DATA ERROR")
    }
  }
  @Interval(3600000) //runs every 1 hour
  async updateNbaAthleteInjuryStatus(){
    this.logger.debug("Update NBA Athlete Injury Status: STARTED")

    const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if (status === 200){
      const updateAthlete: Athlete[] = []
      for (let athlete of data){
        const apiId: number = athlete["PlayerID"]
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId },
        })

        if (curAthlete){
          curAthlete.isInjured = athlete["InjuryStatus"]
          updateAthlete.push(curAthlete)
        } 

        await Athlete.save(updateAthlete, {chunk: 20})

        
      }
      this.logger.debug("Update NBA Injury Status: FINISHED")
    } else{
      this.logger.error("NBA Athlete Injury Data: SPORTS DATA ERROR")
    }
  }
  @Timeout(1)
  async updateNflAthleteStatsAllWeeks() {
    this.logger.debug("Update NFL Athlete Stats All Weeks: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        // const season = timeFrame.ApiSeason
        // const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : "1"
        const season = "2022PLAY"
        const week = "18"

        for (let curWeek = 1; curWeek <= Number(week); curWeek++) {
          const { data, status } = await axios.get(
            `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${curWeek}?key=${process.env.SPORTS_DATA_NFL_KEY}`
          )

          if (status === 200) {
            const newStats: AthleteStat[] = []
            const updateStats: AthleteStat[] = []

            for (let athleteStat of data) {
              const apiId: number = athleteStat["PlayerID"]
              const curStat = await AthleteStat.findOne({
                where: { athlete: { apiId }, season: season, week: curWeek.toString(), type: AthleteStatType.WEEKLY },
                relations: {
                  athlete: true,
                },
              })

              const opponent = await Team.findOne({
                where: { apiId: athleteStat["GlobalOpponentID"] },
              })

              if (curStat) {
                // Update stats here
                curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
                curStat.completion = athleteStat["PassingCompletionPercentage"]
                curStat.carries = athleteStat["RushingAttempts"]
                curStat.passingYards = athleteStat["PassingYards"]
                curStat.rushingYards = athleteStat["RushingYards"]
                curStat.receivingYards = athleteStat["ReceivingYards"]
                curStat.interceptions = athleteStat["PassingInterceptions"]
                curStat.passingTouchdowns = athleteStat["PassingTouchdowns"]
                curStat.rushingTouchdowns = athleteStat["RushingTouchdowns"]
                curStat.receivingTouchdowns = athleteStat["ReceivingTouchdowns"]
                curStat.targets = athleteStat["ReceivingTargets"]
                curStat.receptions = athleteStat["Receptions"]
                curStat.played = athleteStat["Played"]
                curStat.opponent = opponent
                updateStats.push(curStat)
              } else {
                const curAthlete = await Athlete.findOne({
                  where: { apiId },
                })

                if (curAthlete) {
                  newStats.push(
                    AthleteStat.create({
                      athlete: curAthlete,
                      season: season,
                      week: curWeek.toString(),
                      opponent: opponent,
                      gameDate: new Date(athleteStat["GameDate"]),
                      type: AthleteStatType.WEEKLY,
                      played: athleteStat["Played"],
                      position: athleteStat["Position"],
                      fantasyScore: athleteStat["FantasyPointsDraftKings"],
                      completion: athleteStat["PassingCompletionPercentage"],
                      carries: athleteStat["RushingAttempts"],
                      passingYards: athleteStat["PassingYards"],
                      rushingYards: athleteStat["RushingYards"],
                      receivingYards: athleteStat["ReceivingYards"],
                      passingTouchdowns: athleteStat["PassingTouchdowns"],
                      interceptions: athleteStat["PassingInterceptions"],
                      rushingTouchdowns: athleteStat["RushingTouchdowns"],
                      receivingTouchdowns: athleteStat["ReceivingTouchdowns"],
                      targets: athleteStat["ReceivingTargets"],
                      receptions: athleteStat["Receptions"],
                    })
                  )
                }
              }
            }

            await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

            this.logger.debug(`Update NFL Athlete Stats Week ${curWeek}: FINISHED`)
          } else {
            this.logger.error("NFL Athlete Stats Data: SPORTS DATA ERROR")
          }
        }
      }
    } else {
      this.logger.error("NFL Timeframes Data: SPORTS DATA ERROR")
    }

    this.logger.debug("Update NFL Athlete Stats All Weeks: FINISHED")
  }

  @Cron("55 11 * * *", {
    name: "updateNflTeamScores",
    timeZone: "Asia/Manila",
  })
  async updateNflTeamScores() {
    this.logger.debug("Update NFL Team Scores: STARTED")

    const timeFrames = await axios.get(`https://api.sportsdata.io/v3/nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        const season = timeFrame.ApiSeason
        // const season = "2021REG"
        const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : 1

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${week}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        )

        if (status === 200) {
          const now = new Date()
          const gameTeams = []

          // Get active games
          const games = await Game.find({
            where: {
              startTime: LessThanOrEqual(now),
              endTime: MoreThanOrEqual(now),
            },
            relations: {
              teams: {
                athletes: {
                  athlete: true,
                },
              },
            },
          })

          for (let game of games) {
            for (let gameTeam of game.teams) {
              var totalFantasyScore = 0

              for (let athlete of gameTeam.athletes) {
                const athleteData = data.find((athleteData: any) => athleteData.PlayerID === athlete.athlete.apiId)

                if (athleteData !== undefined) {
                  totalFantasyScore += athleteData.FantasyPointsDraftKings
                }
              }

              gameTeam.fantasyScore = totalFantasyScore
              gameTeams.push(gameTeam)
            }
          }

          await GameTeam.save(gameTeams, { chunk: 20 })

          this.logger.debug("Update NFL Team Scores: FINISHED")
        }
      }
    }
  }

  // @Timeout(1)
  @Interval(900000) // Runs every 15 mins
  async updateNbaAthleteStatsPerSeason() {
    this.logger.debug("Update NBA Athlete Stats: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data

      if (timeFrame) {
        const season = timeFrame.ApiSeason

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NBA_KEY}`
        )

        if (status === 200) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const numberOfGames: number = athleteStat["Games"] > 0 ? athleteStat["Games"] : 1
            const curStat = await AthleteStat.findOne({
              where: { athlete: { apiId }, season: season.toString(), type: AthleteStatType.SEASON },
              relations: {
                athlete: true,
              },
            })

            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"] / numberOfGames
              curStat.points = athleteStat["Points"] / numberOfGames
              curStat.rebounds = athleteStat["Rebounds"] / numberOfGames
              curStat.offensiveRebounds = athleteStat["OffensiveRebounds"] / numberOfGames
              curStat.defensiveRebounds = athleteStat["DefensiveRebounds"] / numberOfGames
              curStat.assists = athleteStat["Assists"] / numberOfGames
              curStat.steals = athleteStat["Steals"] / numberOfGames
              curStat.blockedShots = athleteStat["BlockedShots"] / numberOfGames
              curStat.turnovers = athleteStat["Turnovers"] / numberOfGames
              curStat.personalFouls = athleteStat["PersonalFouls"] / numberOfGames
              curStat.fieldGoalsMade = athleteStat["FieldGoalsMade"] / numberOfGames
              curStat.fieldGoalsAttempted = athleteStat["FieldGoalsAttempted"] / numberOfGames
              curStat.fieldGoalsPercentage = athleteStat["FieldGoalsPercentage"] / numberOfGames
              curStat.threePointersMade = athleteStat["ThreePointersMade"] / numberOfGames
              curStat.threePointersAttempted = athleteStat["ThreePointersAttempted"] / numberOfGames
              curStat.threePointersPercentage = athleteStat["ThreePointersPercentage"] / numberOfGames
              curStat.freeThrowsMade = athleteStat["FreeThrowsMade"] / numberOfGames
              curStat.freeThrowsAttempted = athleteStat["FreeThrowsAttempted"] / numberOfGames
              curStat.freeThrowsPercentage = athleteStat["FreeThrowsPercentage"] / numberOfGames
              curStat.minutes = athleteStat["Minutes"] / numberOfGames
              curStat.played = athleteStat["Games"]
              updateStats.push(curStat)
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              })

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season.toString(),
                    type: AthleteStatType.SEASON,
                    position: athleteStat["Position"],
                    played: athleteStat["Games"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"] / numberOfGames,
                    points: athleteStat["Points"] / numberOfGames,
                    rebounds: athleteStat["Rebounds"] / numberOfGames,
                    offensiveRebounds: athleteStat["OffensiveRebounds"] / numberOfGames,
                    defensiveRebounds: athleteStat["DefensiveRebounds"] / numberOfGames,
                    assists: athleteStat["Assists"] / numberOfGames,
                    steals: athleteStat["Steals"] / numberOfGames,
                    blockedShots: athleteStat["BlockedShots"] / numberOfGames,
                    turnovers: athleteStat["Turnovers"] / numberOfGames,
                    personalFouls: athleteStat["PersonalFouls"] / numberOfGames,
                    fieldGoalsMade: athleteStat["FieldGoalsMade"] / numberOfGames,
                    fieldGoalsAttempted: athleteStat["FieldGoalsAttempted"] / numberOfGames,
                    fieldGoalsPercentage: athleteStat["FieldGoalsPercentage"] / numberOfGames,
                    threePointersMade: athleteStat["ThreePointersMade"] / numberOfGames,
                    threePointersAttempted: athleteStat["ThreePointersAttempted"] / numberOfGames,
                    threePointersPercentage: athleteStat["ThreePointersPercentage"] / numberOfGames,
                    freeThrowsMade: athleteStat["FreeThrowsMade"] / numberOfGames,
                    freeThrowsAttempted: athleteStat["FreeThrowsAttempted"] / numberOfGames,
                    freeThrowsPercentage: athleteStat["FreeThrowsPercentage"] / numberOfGames,
                    minutes: athleteStat["Minutes"] / numberOfGames,
                  })
                )
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

          this.logger.debug("Update NBA Athlete Stats: FINISHED")
        } else {
          this.logger.error("NBA Athlete Stats Data: SPORTS DATA ERROR")
        }
      }
    } else {
      this.logger.error("NBA Timeframes Data: SPORTS DATA ERROR")
    }
  }

   //@Timeout(1)
  @Interval(300000) // Runs every 5 mins
  async updateNbaAthleteStatsPerDay() {
    this.logger.debug("Update NBA Athlete Stats Per Day: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data

      if (timeFrame) {
        const season = timeFrame.ApiSeason
        const date = moment().subtract(1, "day").toDate()
        const dateFormat = moment(date).format("YYYY-MMM-DD").toUpperCase()

        this.logger.debug(dateFormat)

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_NBA_KEY}`
        )

        if (status === 200) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const curStat = await AthleteStat.findOne({
              where: {
                statId: athleteStat["StatID"],
              },
              relations: {
                athlete: true,
              },
            })

            const opponent = await Team.findOne({
              where: { apiId: athleteStat["GlobalOpponentID"] },
            })

            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
              curStat.opponent = opponent
              curStat.season = season
              curStat.points = athleteStat["Points"]
              curStat.rebounds = athleteStat["Rebounds"]
              curStat.offensiveRebounds = athleteStat["OffensiveRebounds"]
              curStat.defensiveRebounds = athleteStat["DefensiveRebounds"]
              curStat.assists = athleteStat["Assists"]
              curStat.steals = athleteStat["Steals"]
              curStat.blockedShots = athleteStat["BlockedShots"]
              curStat.turnovers = athleteStat["Turnovers"]
              curStat.personalFouls = athleteStat["PersonalFouls"]
              curStat.fieldGoalsMade = athleteStat["FieldGoalsMade"]
              curStat.fieldGoalsAttempted = athleteStat["FieldGoalsAttempted"]
              curStat.fieldGoalsPercentage = athleteStat["FieldGoalsPercentage"]
              curStat.threePointersMade = athleteStat["ThreePointersMade"]
              curStat.threePointersAttempted = athleteStat["ThreePointersAttempted"]
              curStat.threePointersPercentage = athleteStat["ThreePointersPercentage"]
              curStat.freeThrowsMade = athleteStat["FreeThrowsMade"]
              curStat.freeThrowsAttempted = athleteStat["FreeThrowsAttempted"]
              curStat.freeThrowsPercentage = athleteStat["FreeThrowsPercentage"]
              curStat.minutes = athleteStat["Minutes"]
              curStat.played = athleteStat["Games"]
              updateStats.push(curStat)
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              })

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season,
                    opponent: opponent,
                    gameDate: date,
                    statId: athleteStat["StatID"],
                    type: AthleteStatType.DAILY,
                    position: athleteStat["Position"],
                    played: athleteStat["Games"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"],
                    points: athleteStat["Points"],
                    rebounds: athleteStat["Rebounds"],
                    offensiveRebounds: athleteStat["OffensiveRebounds"],
                    defensiveRebounds: athleteStat["DefensiveRebounds"],
                    assists: athleteStat["Assists"],
                    steals: athleteStat["Steals"],
                    blockedShots: athleteStat["BlockedShots"],
                    turnovers: athleteStat["Turnovers"],
                    personalFouls: athleteStat["PersonalFouls"],
                    fieldGoalsMade: athleteStat["FieldGoalsMade"],
                    fieldGoalsAttempted: athleteStat["FieldGoalsAttempted"],
                    fieldGoalsPercentage: athleteStat["FieldGoalsPercentage"],
                    threePointersMade: athleteStat["ThreePointersMade"],
                    threePointersAttempted: athleteStat["ThreePointersAttempted"],
                    threePointersPercentage: athleteStat["ThreePointersPercentage"],
                    freeThrowsMade: athleteStat["FreeThrowsMade"],
                    freeThrowsAttempted: athleteStat["FreeThrowsAttempted"],
                    freeThrowsPercentage: athleteStat["FreeThrowsPercentage"],
                    minutes: athleteStat["Minutes"],
                  })
                )
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

          this.logger.debug("Update NBA Athlete Stats Per Day: FINISHED")
        }
      }
    } else {
      this.logger.error("NBA Timeframes Data: SPORTS DATA ERROR")
    }
  }
  
  @Timeout(1)
  async getInitialNflTimeframe (){

    this.logger.debug("Get Initial NFL Timeframe: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/recent?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if(status === 200){
      const newTimeframe: Timeframe[] = []
      const updateTimeframe : Timeframe[] = []

      for (let timeframe of data){
        const apiSeason: string = timeframe["ApiSeason"]
        const apiWeek: string = timeframe["ApiWeek"]
        const apiName: string = timeframe["Name"]
        const currTimeframe = await Timeframe.findOne({
          where : {
            apiSeason: apiSeason,
            apiWeek: apiWeek,
            apiName: apiName,
          }
        })

        if(currTimeframe){
          currTimeframe.apiName = timeframe["Name"]
          currTimeframe.apiWeek = timeframe["ApiWeek"]
          currTimeframe.apiSeason = timeframe["ApiSeason"]
          currTimeframe.startDate = timeframe["StartDate"]
          currTimeframe.endDate = timeframe["EndDate"]
          updateTimeframe.push(currTimeframe)
        } else{
          newTimeframe.push(
            Timeframe.create({
              apiName: timeframe["Name"],
              apiWeek: timeframe["ApiWeek"],
              apiSeason: timeframe["ApiSeason"],
              sport: SportType.NFL,
              startDate: timeframe["StartDate"],
              endDate: timeframe["EndDate"],
            })
          )
        }
      }
      await Timeframe.save([...newTimeframe, ...updateTimeframe], { chunk: 20})
      this.logger.debug("Get Initial NFL Timeframe: FINISHED")
    } else{
      this.logger.error("Get Initial NFL Timeframe: SPORTS DATA ERROR")
    }
  }

  @Interval(259200000) //Runs every 3 days
  async updateNflTimeframe (){

    this.logger.debug("Update NFL Timeframe: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/recent?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if(status === 200){
      const newTimeframe: Timeframe[] = []
      const updateTimeframe : Timeframe[] = []

      for (let timeframe of data){
        const apiSeason: string = timeframe["ApiSeason"]
        const apiWeek: string = timeframe["ApiWeek"]
        const apiName: string = timeframe["Name"]
        const currTimeframe = await Timeframe.findOne({
          where : {
            apiSeason: apiSeason,
            apiWeek: apiWeek,
            apiName: apiName,
          }
        })

        if(currTimeframe){
          currTimeframe.apiName = timeframe["Name"]
          currTimeframe.apiWeek = timeframe["ApiWeek"]
          currTimeframe.apiSeason = timeframe["ApiSeason"]
          currTimeframe.startDate = timeframe["StartDate"]
          currTimeframe.endDate = timeframe["EndDate"]
          updateTimeframe.push(currTimeframe)
        } else{
          newTimeframe.push(
            Timeframe.create({
              apiName: timeframe["Name"],
              apiWeek: timeframe["ApiWeek"],
              apiSeason: timeframe["ApiSeason"],
              sport: SportType.NFL,
              startDate: timeframe["StartDate"],
              endDate: timeframe["EndDate"],
            })
          )
        }
      }
      await Timeframe.save([...newTimeframe, ...updateTimeframe], { chunk: 20})
      this.logger.debug("Update NFL Timeframe: FINISHED")
    } else{
      this.logger.error("Update NFL Timeframe: SPORTS DATA ERROR")
    }
  }

  //@Timeout(1)
  @Interval(3600000) //Runs every 1 hour
  async updateNbaCurrentSeason () {
    
    this.logger.debug("Update NBA Current Season: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if(status === 200){
      const newSeason: Timeframe[] = []
      const updateSeason: Timeframe[] = []

      const season = data
      const currSeason = await Timeframe.findOne({
        where: {
          sport: SportType.NBA
        }
      })

      if(currSeason){
        currSeason.apiName = season["Description"]
        currSeason.season = season["Season"]
        currSeason.seasonType = getSeasonType(season["SeasonType"])
        currSeason.apiSeason = season["ApiSeason"]
        currSeason.startDate = season["RegularSeasonStartDate"]
        currSeason.endDate = season["PostSeasonStartDate"]
        updateSeason.push(currSeason)
      } else{
        
        newSeason.push(
          Timeframe.create({
            apiName: season["Description"],
            season: season["Season"],
            seasonType: getSeasonType(season["SeasonType"]),
            apiSeason: season["ApiSeason"],
            startDate: season["RegularSeasonStartDate"],
            endDate: season["PostSeasonStartDate"],
            sport: SportType.NBA,
          })
        )
      }
      
      await Timeframe.save([...newSeason, ...updateSeason], {chunk: 20})
      this.logger.debug("Update NBA Current Season: FINISHED")
    } else{
      this.logger.debug("Update NBA Current Season: SPORTS DATA ERROR")
    }
    
  }
  
  @Timeout(1)
  async updateNbaSchedules(){
    this.logger.debug("UPDATE NBA Schedules: STARTED")

    const currSeason = await Timeframe.findOne({
      where: {sport: SportType.NBA}
    })

    if(currSeason){

      const currSchedules = await Schedule.findOne({
        where: { seasonType: Not(currSeason.seasonType) }
      })

      if(currSchedules){
        await Schedule.delete({ seasonType: Not(currSeason.seasonType)})
      }

      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/Games/${currSeason.apiSeason}?key=${process.env.SPORTS_DATA_NBA_KEY}`)

      if (status === 200){
        const newSchedule: Schedule[] = []
        const updateSchedule: Schedule[] = []

        for(let schedule of data) {
          const gameId: number = schedule["GameID"]

          const currSchedule = await Schedule.findOne({
            where: { gameId: gameId }
          })

          if(currSchedule){
            currSchedule.season = schedule["Season"]
            currSchedule.seasonType = schedule["SeasonType"]
            currSchedule.status = schedule["Status"]
            currSchedule.isClosed = schedule["IsClosed"]
            currSchedule.dateTime = schedule["DateTime"]
            currSchedule.dateTimeUTC = schedule["DateTimeUTC"]
            updateSchedule.push(currSchedule)
          } else{
            newSchedule.push(
              Schedule.create({
                gameId: schedule["GameID"],
                season: schedule["Season"],
                seasonType: schedule["SeasonType"],
                status: schedule["Status"],
                isClosed: schedule["IsClosed"],
                dateTime: schedule["DateTime"],
                dateTimeUTC: schedule["DateTimeUTC"],
              })
            )
          }
        }
        await Schedule.save([...newSchedule, ...updateSchedule], {chunk: 20})
      }
    } else{
      this.logger.error("Update NBA Schedules: ERROR CURRENT SEASON NOT FOUND")
    }
    
  }
}
