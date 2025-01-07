import { useEffect, useMemo, useState } from "react";
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
  // Add similarity map to store pre-calculated distances
  similarities: { [path: string]: Array<{ path: string; distance: number }> };
};

// Optimized Levenshtein distance with early termination
function editDistance(a: string, b: string, maxDistance = Infinity): number {
  if (!a || !b) {
    return maxDistance;
  }
  // Early length checks
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDistance) return maxDistance + 1;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Use smaller arrays and only keep track of current and previous row
  let prev = new Array(lenB + 1);
  let curr = new Array(lenB + 1);

  // Initialize first row
  for (let i = 0; i <= lenB; i++) prev[i] = i;

  // Main loop
  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let minInRow = i;

    for (let j = 1; j <= lenB; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      minInRow = Math.min(minInRow, curr[j]);
    }

    // Early termination if we can't get better than maxDistance
    if (minInRow > maxDistance) return maxDistance + 1;

    // Swap arrays
    [prev, curr] = [curr, prev];
  }

  return prev[lenB];
}

// Calculate similarities for all files upfront
function calculateAllSimilarities(
  data: FileData,
  fileIndex: FileIndex,
  k: number = 5
): { [path: string]: Array<{ path: string; distance: number }> } {
  const similarities: {
    [path: string]: Array<{ path: string; distance: number }>;
  } = {};

  for (const targetPath of fileIndex.paths) {
    const targetContent = data[targetPath];
    const targetLen = fileIndex.lengths[targetPath];

    // Pre-filter candidates using length
    const candidates = fileIndex.paths.filter((path) => {
      if (path === targetPath) return false;
      const len = fileIndex.lengths[path];
      return Math.abs(len - targetLen) <= targetLen / 2;
    });

    // Calculate distances
    const distances = candidates
      .map((path) => ({
        path,
        distance: editDistance(targetContent, data[path], targetLen),
      }))
      .filter((item) => item.distance !== Infinity)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);

    similarities[targetPath] = distances;
  }

  return similarities;
}

// Memoized diff function
function getDiffLines(str1: string, str2: string) {
  str1 = str1 || ""
  str2 = str2 || ""


  console.log(str1, str2)
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
    similarities: {},
  });
  const [data, setData] = useState<FileData>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedSimilarFile, setSelectedSimilarFile] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Initialize IndexedDB
  useEffect(() => {
    const request = indexedDB.open("fileViewerDB", 2); // Increment version for new schema

    request.onerror = () => {
      console.error("Error opening IndexedDB");
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.close();
    };
  }, []);

  // Helper function to open IndexedDB
  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("fileViewerDB", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  // Initialize data and calculate similarities
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      try {
        const db = await openDB();

        // Initial data load and similarity calculation
        const response = await fetch("/data.json");
        if (response.ok) {
          const jsonResponse = await response.json();
          if (jsonResponse) {
            const paths = Object.keys(jsonResponse);
            const lengths = Object.fromEntries(
              paths.map((path) => [path, jsonResponse[path].length])
            );

            // Calculate similarities
            const similarities = calculateAllSimilarities(jsonResponse, {
              paths,
              lengths,
              similarities: {},
            });

            // Save everything to IndexedDB
            const writeTx = db.transaction(
              ["files"],
              "readwrite"
            );
            const fileStore = writeTx.objectStore("files");
            // Save files
            for (const [path, content] of Object.entries(jsonResponse)) {
              await fileStore.put(content, path);
            }

            const newIndex = { paths, lengths, similarities };

            setFileIndex(newIndex);

            // Only keep selected file data in memory
            if (selectedFile) {
              setData({ [selectedFile]: jsonResponse[selectedFile] });
            }
          }
        }

        db.close();
      } catch (error) {
        console.error("Error initializing data:", error);
      }
      setIsLoading(false);
    };

    initialize();
  }, []);

  // Load file content when needed
  const loadFileContent = async (path: string) => {
    const db = await openDB();
    const tx = db.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const request = store.get(path);
    const content: string = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    db.close();

    if (content) {
      setData((prev) => ({ ...prev, [path]: content }));
    }
  };

  // Load selected file contents and cleanup old data
  useEffect(() => {
    if (selectedFile) {
      if (!data[selectedFile]) {
        loadFileContent(selectedFile);
      }
      // Cleanup old data, keeping only selected and similar file
      setData((prev) => {
        const newData: FileData = {};
        if (selectedFile) newData[selectedFile] = prev[selectedFile];
        if (selectedSimilarFile)
          newData[selectedSimilarFile] = prev[selectedSimilarFile];
        return newData;
      });
    }
  }, [selectedFile]);

  // Load similar file contents
  useEffect(() => {
    if (selectedSimilarFile && !data[selectedSimilarFile]) {
      loadFileContent(selectedSimilarFile);
    }
  }, [selectedSimilarFile]);

  const filteredFiles = useMemo(
    () =>
      fileIndex?.paths?.filter((path) =>
        path.toLowerCase().includes(searchQuery.toLowerCase())
      ) || [],
    [fileIndex?.paths, searchQuery]
  );

  const similarFiles = useMemo(
    () => (selectedFile ? fileIndex.similarities[selectedFile] || [] : []),
    [fileIndex.similarities, selectedFile]
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
      <div className="h-screen flex items-center justify-center">
        Loading...
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
                    {similarFiles.map(({ path, distance }) => (
                      <SelectItem key={path} value={path}>
                        {path} (edit distance: {distance})
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
