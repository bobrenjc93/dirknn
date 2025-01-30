import { useEffect, useMemo, useState, useRef } from "react";
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

// Line level diff function using LCS algorithm
function getLineDiffs(str1: string, str2: string) {
  const lines1 = str1.split('\n');
  const lines2 = str2.split('\n');
  const lcs = longestCommonSubsequence(lines1, lines2);

  const result1: { text: string; type: "same" | "removed" | "diff"; wordsDiff?: string[] }[] = [];
  const result2: { text: string; type: "same" | "added" | "diff"; wordsDiff?: string[] }[] = [];

  let i = 0, j = 0, k = 0;
  while (i < lines1.length || j < lines2.length) {
    if (k < lcs.length && i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
      result1.push({ text: lines1[i], type: "same" });
      result2.push({ text: lines2[j], type: "same" });
      i++;
      j++;
      k++;
    } else {
      const words1 = lines1[i]?.split(' ') || [];
      const words2 = lines2[j]?.split(' ') || [];
      const wordsDiff1 = words1.slice(0, 100).map(word => words2.includes(word) ? word : `<span class="text-red-500">${word}</span>`);
      const wordsDiff2 = words2.slice(0, 100).map(word => words1.includes(word) ? word : `<span class="text-green-500">${word}</span>`);

      if (words1.length > 100) {
        wordsDiff1.push(`<span class="text-red-500">${words1.slice(100).join(' ')}</span>`);
      }
      if (words2.length > 100) {
        wordsDiff2.push(`<span class="text-green-500">${words2.slice(100).join(' ')}</span>`);
      }

      if (i < lines1.length && (k >= lcs.length || lines1[i] !== lcs[k])) {
        result1.push({ text: wordsDiff1.join(' '), type: "diff" });
        i++;
      } else {
        result1.push({ text: "&nbsp", type: "same" });
      }

      if (j < lines2.length && (k >= lcs.length || lines2[j] !== lcs[k])) {
        result2.push({ text: wordsDiff2.join(' '), type: "diff" });
        j++;
      } else {
        result2.push({ text: "&nbsp", type: "same" });
      }
    }
  }

  return { left: result1, right: result2 };
}

function longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
  const dp = Array(arr1.length + 1).fill(null).map(() => Array(arr2.length + 1).fill(0));

  for (let i = 1; i <= arr1.length; i++) {
    for (let j = 1; j <= arr2.length; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = arr1.length, j = arr2.length;
  const lcs = [];

  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
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

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  // Initialize data
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      setProgress(0);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const url = urlParams.get('url');
        const response = await fetch(url || "/data.json");
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
      fileIndex?.paths
        ?.filter((path) =>
          path.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => a.localeCompare(b)) || [],
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
        ? getLineDiffs(data[selectedFile], data[selectedSimilarFile])
        : { left: [], right: [] },
    [data, selectedFile, selectedSimilarFile]
  );

  useEffect(() => {
    if (selectedFile && similarFiles.length > 0) {
      setSelectedSimilarFile(similarFiles[0].path);
    }
  }, [selectedFile, similarFiles]);

  useEffect(() => {
    const syncScroll = () => {
      if (leftPaneRef.current && rightPaneRef.current) {
        const leftPane = leftPaneRef.current;
        const rightPane = rightPaneRef.current;

        const syncScrollPosition = (sourcePane, targetPane) => {
          const sourceScrollTop = sourcePane.scrollTop;
          targetPane.scrollTop = sourceScrollTop;
        };

        leftPane.addEventListener('scroll', () => syncScrollPosition(leftPane, rightPane));
        rightPane.addEventListener('scroll', () => syncScrollPosition(rightPane, leftPane));
      }
    };

    syncScroll();
  }, [diffResult]);

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
              <div ref={leftPaneRef} className="h-full overflow-y-auto border-r px-6">
                {selectedFile ? (
                  <pre className="p-4 rounded bg-muted">
                    {diffResult?.left.map((line, idx) => (
                      <div
                        key={idx}
                        data-type={line.type}
                        dangerouslySetInnerHTML={{ __html: line.text }}
                      />
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

              <div ref={rightPaneRef} className="h-full overflow-y-auto px-6">
                {selectedFile && selectedSimilarFile ? (
                  <pre className="p-4 rounded bg-muted">
                    {diffResult?.right.map((line, idx) => (
                      <div
                        key={idx}
                        data-type={line.type}
                        dangerouslySetInnerHTML={{ __html: line.text }}
                      />
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
