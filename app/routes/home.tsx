import { useEffect, useMemo, useState } from "react";
import { Progress } from "~/components/ui/progress";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function meta() {
  return [
    { title: "KNN File Viewer" },
    {
      name: "description",
      content: "View and compare similar files",
    },
  ];
}

type FileData = {
  [path: string]: string;
};

type FileIndex = {
  paths: string[];
  lengths: { [path: string]: number };
};

// MinHash implementation
function hashFunction(str: string, seed: number): number {
  let hash = seed ^ 0x811C9DC5; // Initialize with seed XORed with a prime offset
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);       // XOR the character code
    hash = (hash * 16777619) >>> 0;  // Multiply by a prime number and ensure unsigned 32-bit
  }
  return hash >>> 0; // Ensure non-negative result by returning unsigned 32-bit
}

function getMinHash(text: string, numHashes: number = 10): number[] {
  // Split into sentences using basic punctuation
  const sentences = text
    .slice(0, 10000)
    .split('\n')

  // Initialize signature array
  const signature = new Array(numHashes).fill(Infinity);

  // For each hash function
  for (let i = 0; i < numHashes; i++) {
    // Find minimum hash for all sentences using this hash function
    for (const sentence of sentences) {
      const hash = hashFunction(sentence.trim(), i);
      signature[i] = Math.min(signature[i], hash);
    }
  }

  return signature;
}

function calculateJaccardSimilarity(sig1: number[], sig2: number[]): number {
  let matches = 0;
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i] === sig2[i]) matches++;
  }
  return matches / sig1.length;
}

// Calculate similarities for selected file
function calculateSimilarities(
  data: FileData,
  selectedPath: string,
  allPaths: string[],
  k: number = 50,
): Array<{ path: string; similarity: number }> {
  const selectedSig = getMinHash(data[selectedPath]);

  return allPaths
    .filter(path => path !== selectedPath)
    .map(path => ({
      path,
      similarity: calculateJaccardSimilarity(selectedSig, getMinHash(data[path]))
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

// Memoized diff function
function getDiffLines(str1: string, str2: string) {
  str1 = str1 || ""
  str2 = str2 || ""

  const lines1 = str1.split("\n");
  const lines2 = str2.split("\n");
  const result1: { text: string; type: "same" | "removed" }[] = [];
  const result2: { text: string; type: "same" | "added" }[] = [];

  let i = 0,
    j = 0;
  while (i < lines1.length || j < lines2.length) {
    if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
      result1.push({ text: lines1[i], type: "same" });
      result2.push({ text: lines2[j], type: "same" });
      i++;
      j++;
    } else {
      if (i < lines1.length) {
        result1.push({ text: lines1[i], type: "removed" });
        i++;
      }
      if (j < lines2.length) {
        result2.push({ text: lines2[j], type: "added" });
        j++;
      }
    }
  }

  return { left: result1, right: result2 };
}

export default function Home() {
  const [fileIndex, setFileIndex] = useState<FileIndex>({
    paths: [],
    lengths: {},
  });
  const [data, setData] = useState<FileData>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedSimilarFile, setSelectedSimilarFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  // Initialize data
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      setProgress(0);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const url = urlParams.get('url');
        const response = await fetch(url);
        if (response.ok) {
          const jsonData = await response.json();
          setProgress(50);

          const paths = Object.keys(jsonData);
          const lengths = Object.fromEntries(
            paths.map((path) => [path, jsonData[path].length])
          );

          setFileIndex({ paths, lengths });
          setData(jsonData);
          setProgress(100);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
      setIsLoading(false);
    };

    initialize();
  }, []);

  const filteredFiles = useMemo(
    () =>
      fileIndex?.paths?.filter((path) =>
        path.toLowerCase().includes(searchQuery.toLowerCase())
      ) || [],
    [fileIndex?.paths, searchQuery]
  );

  const similarFiles = useMemo(
    () => selectedFile ? calculateSimilarities(data, selectedFile, fileIndex.paths) : [],
    [selectedFile, data, fileIndex.paths]
  );

  const diffResult = useMemo(
    () =>
      selectedFile &&
      selectedSimilarFile &&
      data[selectedFile] &&
      data[selectedSimilarFile]
        ? getDiffLines(data[selectedFile], data[selectedSimilarFile])
        : { left: [], right: [] },
    [data, selectedFile, selectedSimilarFile]
  );

  useEffect(() => {
    if (selectedFile && similarFiles.length > 0) {
      setSelectedSimilarFile(similarFiles[0].path);
    }
  }, [selectedFile, similarFiles]);

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col gap-4 items-center justify-center">
        <Progress value={progress} className="w-[60%]" />
        <p className="text-sm text-muted-foreground">Loading files...</p>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ResizablePanelGroup
        direction="horizontal"
        className="w-full rounded-lg border h-[800px]"
      >
        <ResizablePanel defaultSize={25}>
          <div className="flex h-full flex-col p-6">
            <h3 className="font-medium mb-4">Files</h3>
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 mb-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="overflow-y-auto">
              {filteredFiles.map((path) => (
                <div key={path}>
                  <button
                    onClick={() => {
                      setSelectedFile(path);
                    }}
                    className={`text-left p-2 rounded w-full hover:bg-border focus:outline-none ${
                      selectedFile === path ? "bg-accent" : ""
                    }`}
                  >
                    {path}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={75}>
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-2 gap-4 p-6">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Selected:</h3>
                <Select
                  value={selectedFile || ""}
                  onValueChange={setSelectedFile}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a file" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredFiles.map((path) => (
                      <SelectItem key={path} value={path}>
                        {path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Similar:</h3>
                <Select
                  value={selectedSimilarFile || ""}
                  onValueChange={setSelectedSimilarFile}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a similar file" />
                  </SelectTrigger>
                  <SelectContent>
                    {similarFiles.map(({ path, similarity }) => (
                      <SelectItem key={path} value={path}>
                        {path} (~{Math.round(similarity * 100)}% similar)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto border-r px-6">
                {selectedFile ? (
                  <pre className="p-4 rounded bg-muted">
                    {diffResult?.left.map((line, idx) => (
                      <code
                        key={idx}
                        className={`block ${
                          line.type === "removed" ? "bg-red-900/20" : ""
                        }`}
                      >
                        {line.text}
                      </code>
                    ))}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">
                      Select a file to view its contents
                    </span>
                  </div>
                )}
              </div>

              <div className="h-full overflow-y-auto px-6">
                {selectedFile && selectedSimilarFile ? (
                  <pre className="p-4 rounded bg-muted">
                    {diffResult?.right.map((line, idx) => (
                      <code
                        key={idx}
                        className={`block ${
                          line.type === "added" ? "bg-green-900/20" : ""
                        }`}
                      >
                        {line.text}
                      </code>
                    ))}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">
                      Select a file to view similar files
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
