ThisBuild / scalaVersion := "2.13.15"
ThisBuild / organization := "planvault.examples"

lazy val root = (project in file("."))
  .settings(
    name := "planvault-kafka-trigger-fs2",
    version := "0.1.0",
    Compile / run / fork := true,
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-effect" % "3.5.7",
      "com.github.fd4s" %% "fs2-kafka" % "3.5.1",
      "com.softwaremill.sttp.client3" %% "core" % "3.10.1",
      "com.softwaremill.sttp.client3" %% "fs2" % "3.10.1",
      "org.scalameta" %% "munit" % "1.0.0" % Test,
    ),
  )
