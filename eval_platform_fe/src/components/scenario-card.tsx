import type { ScenarioListItem } from "@/api";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { ArrowUpRight } from "lucide-react";
import { Button } from "./ui/button";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Link, useNavigate } from "react-router-dom";

export function ScenarioCard({ scenario }: { scenario: ScenarioListItem }) {
  dayjs.extend(relativeTime);

  const navigate = useNavigate();

  return (
    <Link to={`/scenarios/${scenario.id}`} className="min-h-40">
      <Card className={`h-full border border-l-4 hover:shadow-lg ${scenario.scenario_type == "SQOUTS" ? "border-l-primary" : scenario.scenario_type == "PIPECAT" ? "border-l-[#474F80]" : "border-l-[#5D866C]"}`}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold line-clamp-2">{scenario.name}</CardTitle>
          <CardAction>
            <Button
              variant="link"
              size="icon"
              className="-mr-1"
              aria-label={`Open ${scenario.name}`}
              onClick={() => navigate(`/scenarios/${scenario.id}`)}
            >
              <ArrowUpRight className=" text-primary size-6" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="-mt-4 flex flex-col justify-between h-full">
          <div className="flex flex-col gap-4">
            <p className=" text-gray-600 line-clamp-1">
              {scenario.scenario_type == "TRANSCRIPTION" ?  "Transcription Evaluation" : `${scenario.gateway_url} • ${scenario.token}`}
              {/* {scenario.gateway_url} • {scenario.token} */}
            </p>
            <p className=" text-gray-600 line-clamp-2">{scenario.description}</p>
          </div>
          <div className="flex justify-between mt-3">
            <p className=" text-gray-600">
              {scenario.test_case_count} test case(s)
            </p>
            <p className=" text-gray-600">
              {scenario.latest_test_done
                ? `last run: ${dayjs(scenario.latest_test_done).fromNow()}`
                : "No runs yet"}
            </p>
          </div>
        </CardContent>
        {/* {scenario.gateway_url} */}
      </Card>
    
    </Link>
  );
}
