import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Play, CheckCircle } from "lucide-react";
import { useState } from "react";
import {
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
      <Card className={`overflow-hidden transition-all duration-300 hover:shadow-xl ${
        isSelected ? "border-2 border-primary shadow-lg shadow-primary/20" : "border hover:border-primary/30"
      }`}>
        <CardContent className="p-0">
          {/* Header with photo */}
          <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 p-6">
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
                <AvatarImage src={photoUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  <GraduationCap className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-foreground truncate">{teacherName}</h3>
                <Badge variant="outline" className="mt-1 text-xs">
                  {category}
                </Badge>
                {isSelected && (
                  <Badge className="mt-1 mr-2 bg-green-500 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    معلمك الحالي
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="p-4 space-y-3">
            {bio && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {bio}
              </p>
            )}

            {/* Grades */}
            {grades.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {grades.map(g => (
                  <Badge key={g} variant="secondary" className="text-xs">
                    الصف {formatGrade(g)}
                  </Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {videoUrl && (
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
              )}
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

      {/* Video Dialog */}
      <Dialog open={showVideo} onOpenChange={setShowVideo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>فيديو تعريفي - {teacherName}</DialogTitle>
          </DialogHeader>
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeacherProfileCard;
