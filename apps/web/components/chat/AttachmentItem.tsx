import Link from "next/link";
import { AttachmentType } from "shared/schema/chat";
import { useState } from "react";
import { ImageSkeleton } from "ui/components/image-skeleton";
import Image from "next/image";
import { cloudinary_prefix, cloudinaryLoader } from "@/utils/cloudinary-loader";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "ui/components/dialog";

export function UploadingAttachmentItem({ file }: { file: File }) {
  return (
    <div className="p-3 rounded-lg bg-light-100 dark:bg-dark-700 flex flex-col mt-3">
      <p className="text-foreground text-base font-medium">{file.name}</p>
      <p className="text-sm text-muted-foreground">Uploading...</p>
    </div>
  );
}

export function AttachmentItem({ attachment }: { attachment: AttachmentType }) {
  if (
    attachment.type === "image" &&
    attachment.width != null &&
    attachment.height != null &&
    attachment.url.startsWith(cloudinary_prefix)
  ) {
    return <AttachmentImage attachment={attachment} />;
  }

  return (
    <div className="p-3 rounded-lg bg-card mt-3 group-hover:bg-accent">
      <Link
        target="_blank"
        href={attachment.url}
        className="text-sm font-medium text-foreground"
      >
        {attachment.name}
      </Link>
      <p className="text-sm text-muted-foreground">{attachment.bytes} Bytes</p>
    </div>
  );
}

function AttachmentImage({ attachment }: { attachment: AttachmentType }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const url = decodeURIComponent(attachment.url);

  return (
    <Dialog>
      <ImageSkeleton
        loaded={isLoaded}
        width={attachment.width!}
        height={attachment.height!}
        maxWidth={500}
        maxHeight={400}
      >
        <DialogTrigger asChild>
          <Image
            alt={attachment.name}
            src={url}
            fill
            sizes="(max-width: 500px) 90vw, 500px"
            className="cursor-pointer"
            // loader={cloudinaryLoader}
            onLoad={() => setIsLoaded(true)}
          />
        </DialogTrigger>
      </ImageSkeleton>

      <DialogContent className="flex items-center justify-center bg-transparent max-w-none p-0">
        <DialogClose asChild>
          <Image
            alt="image"
            src={url}
            className="w-[100vw] h-[90vh] max-w-none object-contain"
            width={attachment.width!}
            height={attachment.height!}
            priority
          />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
