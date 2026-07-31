import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle, GraduationCap, Play, Sparkles, Star, Trophy } from "lucide-react";
import { useState } from "react";
import {
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeacherProfileCardProps {
  teacherId: string;
  teacherName: string;
  bio: string | null;
  photoUrl: string | null;
  videoUrl: string | null;
  coverImageUrl?: string | null;
  professionalTitle?: string | null;
  experienceYears?: number;
  qualifications?: string[];
  achievements?: string[];
  category: string;
  grades: string[];
  isSelected?: boolean;
  onSelect: () => void;
}

const TeacherProfileCard = ({
  teacherName,
  bio,
  photoUrl,
  videoUrl,
  coverImageUrl,
  professionalTitle,
  experienceYears,
  qualifications = [],
  achievements = [],
  category,
  grades,
  isSelected,
  onSelect,
}: TeacherProfileCardProps) => {
  const [showVideo, setShowVideo] = useState(false);

  const formatGrade = (grade: string) => {
    if (grade === "first") return "الأول";
    if (grade === "second") return "الثاني";
    if (grade === "third") return "الثالث";
    return grade;
  };

  return (
    <>
      <Card className={`overflow-hidden rounded-xl transition-all duration-300 hover:shadow-xl ${
        isSelected ? "border-2 border-primary shadow-lg shadow-primary/20" : "border hover:border-primary/30"
      }`}>
        <CardContent className="p-0">
          <div className="relative overflow-hidden">
            <div className="h-32 w-full bg-[linear-gradient(135deg,hsl(var(--teacher-home-hero-from)),hsl(var(--teacher-home-hero-to)))]">
              {coverImageUrl ? <img src={coverImageUrl} alt={teacherName} className="h-full w-full object-cover" /> : null}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="flex items-end gap-4">
                <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
                  <AvatarImage src={photoUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    <GraduationCap className="h-8 w-8" />
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-foreground truncate">{teacherName}</h3>
                  <p className="text-sm text-muted-foreground truncate mt-1">{professionalTitle || `متخصص في ${category}`}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs gap-1">
                      <BookOpen className="h-3 w-3" />
                      {category}
                    </Badge>
                    {typeof experienceYears === "number" && experienceYears > 0 ? (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Sparkles className="h-3 w-3" />
                        {experienceYears} سنوات خبرة
                      </Badge>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <Badge className="mt-1 mr-2 bg-green-500 gap-1">
                      <CheckCircle className="h-3 w-3" />
                      معلمك الحالي
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {bio ? (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{bio}</p>
            ) : null}

            {qualifications.length > 0 || achievements.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {qualifications.length > 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-bold text-foreground">
                      <Star className="h-3.5 w-3.5" />
                      المؤهلات
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{qualifications.slice(0, 2).join(" • ")}</p>
                  </div>
                ) : null}

                {achievements.length > 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-bold text-foreground">
                      <Trophy className="h-3.5 w-3.5" />
                      الإنجازات
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{achievements.slice(0, 2).join(" • ")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {grades.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {grades.map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs">
                    الصف {formatGrade(g)}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2 pt-2">
              {videoUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowVideo(true);
                  }}
                >
                  <Play className="h-4 w-4" />
                  فيديو تعريفي
                </Button>
              ) : null}

              <Button
                size="sm"
                className={`gap-1 flex-1 ${isSelected ? "bg-green-500 hover:bg-green-600" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
              >
                {isSelected ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    تم الاختيار
                  </>
                ) : (
                  "اختيار المعلم"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showVideo} onOpenChange={setShowVideo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>فيديو تعريفي - {teacherName}</DialogTitle>
          </DialogHeader>
          {videoUrl ? <video src={resolveBunnyStorageUrl(videoUrl)} controls autoPlay className="w-full rounded-lg" /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeacherProfileCard;
