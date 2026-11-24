import { type Run, type TimelineItem, runs } from "@/api";
import { MetricResult } from "@/components/metric-result";
import { DynamicCrumb } from "@/components/dynamic-crumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2} from "lucide-react";
import { DeleteRowDialog } from "@/components/delete-row-dialog";
import { AudioPlayer } from "@/components/audio-player";
import { SentText } from "@/components/sent-text";
import { EventsTimeline } from "@/components/events-timeline";

export function RunDetail() {
  const loc = useLocation();
  const { sceneid, tcid, runid } = useParams();
  const [error, setError] = useState("");
  const [runDetail, setRunDetail] = useState<Run>();
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  // undefined: not asked for yet; null: loading; "error": no events for this run
  const [timeline, setTimeline] = useState<TimelineItem[] | null | "error">();

  async function getTimeline() {
    if (timeline !== undefined || !runDetail) return;
    setTimeline(null);
    try {
      setTimeline(await runs.events(runDetail.id));
    } catch {
      setTimeline("error");
    }
  }

  useEffect(() => {
    console.log(error);
  }, [error]);

  useEffect(() => {
    let ignore = false; // stops an old, slow response overwriting a newer one
    async function load() {
      setError("");
      try {
        const res = await runs.get(runid!);
        if (!ignore) {
          setRunDetail(res);
        }
        // console.log(res.has_recording);
      } catch {
        if (!ignore) setError("Couldn't load the run.");
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [runid]);

  async function getRecording() {
    if (!runDetail?.has_recording || audioSrc != undefined) return;
    // if (audioSrc) return;
    let url: string | undefined;
    runs.recording(runDetail.id).then((b) => {
      url = URL.createObjectURL(b);
      setAudioSrc(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }

  function eventsTab() {
    if (timeline === "error")
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          This run has no events log.
        </p>
      );
    if (!timeline)
      return (
        <Loader2 size={40} className="mx-auto mt-6 animate-spin text-primary" />
      );
    return (
      <div>
        {runDetail?.token_count && (
          <div className=" px-4 py-3 border-2 rounded-2xl mb-3">
            <Collapsible className="group/token">
              <div className="flex justify-between align-middle">
                <p className="font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm">
                  Tester Usage
                </p>
                <div className="flex gap-4">
                  <div className="flex gap-3">
                    <p className="font-bold">
                      {((runDetail?.token_count?.eval_in ?? 0) +
                      (runDetail?.token_count?.eval_out ?? 0) +
                      (runDetail?.token_count?.reply_in ?? 0) +
                      (runDetail?.token_count?.reply_out ?? 0)).toLocaleString()}{" "}
                      <span className="font-normal text-muted-foreground text-xs">
                        LLM Tokens
                      </span>
                    </p>
                    <p className="font-bold">
                      {runDetail.token_count.tts_chars?.toLocaleString()}{" "}
                      <span className="font-normal text-muted-foreground text-xs">
                        TTS Tokens
                      </span>
                    </p>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    >
                      <ChevronDown className="size-5 transition-transform duration-200 group-data-[state=open]/token:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="flex flex-col gap-3 py-2">
                <div>
                  <div className="flex justify-between items-center gap-5">
                    <p className="font-heading text-base leading-snug ">Tester</p>
                    <div className="w-full flex gap-0.5">
                      <div className={`bg-[#54489C] rounded-sm h-4 transition-all`} style={{width: `${((runDetail.token_count.reply_in || 0)/((runDetail.token_count.reply_in || 0)+(runDetail.token_count.reply_out || 0))*100).toFixed(0)}%`}}/>
                      <div className={`bg-[#8F82E8] rounded-sm h-4 transition-all`} style={{width: `${((runDetail.token_count.reply_out || 0)/((runDetail.token_count.reply_in || 0)+(runDetail.token_count.reply_out || 0))*100).toFixed(0)}%`}}/>
                    </div>
                    <div>
                      <p className="font-heading text-base leading-snug font-bold">{((runDetail.token_count.reply_in || 0)+(runDetail.token_count.reply_out || 0)).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex w-full justify-between gap-5">
                    <p className="text-xs text-muted-foreground">Replies</p>
                    <div className="flex gap-2 text-left w-full px-5">
                      <p className="text-muted-foreground flex items-center text-center gap-1"><div className="bg-[#54489C] size-3 rounded-xs"/> Input <span className="font-medium text-black">{runDetail.token_count.reply_in}</span></p>
                      <p className="text-muted-foreground flex items-center text-center gap-1"><div className="bg-[#8F82E8] size-3 rounded-xs"/> Output <span className="font-medium text-black">{runDetail.token_count.reply_out}</span></p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">Tokens</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center gap-5">
                    <p className="font-heading text-base leading-snug ">Judge</p>
                    <div className="w-full flex gap-0.5">
                      <div className={`bg-[#54489C] rounded-sm h-4 transition-all`} style={{width: `${((runDetail.token_count.eval_in || 0)/((runDetail.token_count.eval_in || 0)+(runDetail.token_count.eval_out || 0))*100).toFixed(0)}%`}}/>
                      <div className={`bg-[#8F82E8] rounded-sm h-4 transition-all`} style={{width: `${((runDetail.token_count.eval_out || 0)/((runDetail.token_count.eval_in || 0)+(runDetail.token_count.eval_out || 0))*100).toFixed(0)}%`}}/>
                    </div>
                    <div>
                      <p className="font-heading text-base leading-snug font-bold">{((runDetail.token_count.eval_in || 0)+(runDetail.token_count.eval_out || 0)).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex w-full justify-between gap-5">
                    <p className="text-xs text-muted-foreground">Replies</p>
                    <div className="flex gap-2 text-left w-full px-5">
                      <p className="text-muted-foreground flex items-center text-center gap-1"><div className="bg-[#54489C] size-3 rounded-xs"/> Input <span className="font-medium text-black">{runDetail.token_count.eval_in}</span></p>
                      <p className="text-muted-foreground flex items-center text-center gap-1"><div className="bg-[#8F82E8] size-3 rounded-xs"/> Output <span className="font-medium text-black">{runDetail.token_count.eval_out}</span></p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">Tokens</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center gap-5">
                    <p className="font-heading text-base leading-snug ">Voice</p>
                    <div>
                      <p className="font-heading text-base leading-snug font-bold">{(runDetail.token_count.tts_chars || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex w-full justify-between gap-5">
                    <p className="text-xs text-muted-foreground">TTS</p>
                    <p className="text-right text-xs text-muted-foreground">Tokens</p>
                  </div>
                </div>
              </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
        <EventsTimeline items={timeline} type={runDetail?.scenario_type} />
      </div>
    );
  }

  function Results() {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className=" text-black font-bold ">
              Overall Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p>{runDetail?.eval_res?.overall_feedback}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className=" text-black font-bold ">
              Metrics Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runDetail?.eval_res ? (
              <MetricResult
                evalRes={runDetail.eval_res}
                passThreshold={runDetail.pass_threshold}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No scores yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  function transcriptChat() {
    return (
      <>
        {audioSrc && (
          <div>
            <AudioPlayer src={audioSrc} />
            {/* <audio controls src={audioSrc} className="w-full" /> */}
            <p className="text-sm text-muted-foreground">
              Left: tester · Right: Sqouts
            </p>
          </div>
        )}

        {runDetail?.transcript?.map((chat, i) => {
          const ai = chat.speaker === "ai";
          if (ai) {
            return (
              <div className="my-3" key={i}>
                <Message>
                  <MessageAvatar>
                    <Avatar>
                      <AvatarFallback>
                        {runDetail.scenario_type == "SQOUTS" ? "SQ" : "AG"}
                      </AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
                  <MessageContent>
                    <Bubble variant="muted">
                      <BubbleContent>{chat.text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </div>
            );
          } else {
            return (
              <div className="my-3" key={i}>
                <Message align="end">
                  <MessageAvatar>
                    <Avatar>
                      <AvatarFallback>MER</AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
                  <MessageContent>
                    <Bubble>
                      <BubbleContent>{chat.text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
                {chat.plain != null && runDetail?.plain?.[chat.plain] && (
                  <div className="mt-1 flex justify-end pr-10">
                    <Collapsible className="group/sent flex max-w-[80%] flex-col items-end">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                        >
                          What the tester sent
                          <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/sent:rotate-180" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        <SentText text={runDetail?.plain?.[chat.plain] ?? ""} />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>
            );
          }
        })}
      </>
    );
  }

  if (!runDetail) {
    return (
      <div>
        <DynamicCrumb url={loc.pathname} />
        <div className="w-full mt-6">
          <Loader2 size={57} className="animate-spin text-primary mx-auto" />
        </div>
      </div>
    );
  }

  if (runDetail?.status == "RUNNING")
    return (
      <div>
        <DynamicCrumb url={loc.pathname} />
        <h1 className=" text-3xl mb-4 mt-2">Run: {runDetail?.id}</h1>
        <div className="w-full text-center">
          <p className="mx-auto">Call has not concluded</p>
        </div>
      </div>
    );

  return (
    <div>
      <DynamicCrumb url={loc.pathname} />
      <div className="mb-4 mt-2 flex items-start justify-between gap-4">
        <h1 className="text-3xl break-all">Run: {runDetail?.id}</h1>
        <DeleteRowDialog
          type="run"
          prevId={[Number(sceneid), Number(tcid)]}
          id={runDetail?.id}
        />
      </div>
      <div className="md:grid grid-cols-3 gap-4 justify-between">
        <div className="col-span-1 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className=" text-black font-bold ">Verdict</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col w-full gap-4">
                {runDetail?.status == "ABORTED" ? (
                  <div className="w-full items-center">
                    <Badge variant="destructive" className="mx-auto">
                      Run Aborted
                    </Badge>
                  </div>
                ) : (
                  <div className="flex mx-auto justify-center">
                    <div className="flex items-end">
                      <div className="font-bold text-5xl">
                        {runDetail?.eval_res?.overall_score}
                      </div>
                      <p className="text-xl text-muted-foreground">/ 5 </p>
                    </div>
                    <div>
                      {runDetail?.eval_res?.passed ? (
                        <Badge className="text-emerald-700 bg-emerald-100">
                          PASS
                        </Badge>
                      ) : (
                        <Badge variant="destructive">FAIL</Badge>
                      )}
                    </div>
                  </div>
                )}
                {runDetail?.eval_res?.most_important_improvement && (
                  <div className="p-3 bg-muted rounded-xl">
                    <p className="mb-1 text-muted-foreground">
                      MOST IMPORTANT IMPROVEMENT
                    </p>
                    <p className="text-">
                      {runDetail?.eval_res?.most_important_improvement}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          {runDetail?.eval_res?.strengths && (
            <Card>
              <CardHeader>
                <CardTitle className=" text-black font-bold ">
                  Strength
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {runDetail?.eval_res?.strengths.map((stro, i) => (
                    <div className="flex gap-4 " key={i}>
                      <p className="font-bold text-xl -mt-1">•</p>
                      <p>{stro}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {runDetail?.eval_res?.weaknesses && (
            <Card>
              <CardHeader>
                <CardTitle className=" text-black font-bold ">
                  Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {runDetail?.eval_res?.weaknesses.map((weak, i) => (
                    <div className="flex gap-4 " key={i}>
                      <p className="font-bold text-xl -mt-1">•</p>
                      <p>{weak}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        {!runDetail ? (
          <div className="col-span-2">
            <Loader2 size={57} className="animate-spin text-primary mx-auto" />
          </div>
        ) : (
          <div className="col-span-2 gap-4 flex flex-col">
            <Tabs
              defaultValue={runDetail?.status === "ABORTED" ? "transc" : "eval"}
              onValueChange={(val) => {
                if (val == "transc") {
                  getRecording();
                }
                if (val == "events") getTimeline();
              }}
            >
              <TabsList>
                {runDetail.status === "DONE" && (
                  <TabsTrigger value="eval">Evaluation</TabsTrigger>
                )}
                <TabsTrigger value="transc">Transcript</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
              </TabsList>
              <TabsContent value="eval">{Results()}</TabsContent>
              <TabsContent value="transc">{transcriptChat()}</TabsContent>
              <TabsContent value="events">{eventsTab()}</TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
