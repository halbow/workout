# Logging



Let's add some logging to the app.

Let's a debug mode that logs all the command we send and data we receive.

We can log to e.g. /tmp/tiny_trainer.log

if the logging is in info mode, let's only log the command we send and receive, not the pulling of tha data (number of watt w epull every X seconds)


Any errors is logged to the log file
+ ideally if an error happend,we get the some context history (the last 50 logs before and the next 50 logs) so that we can have some context to debug:wq
