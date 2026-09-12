import json, re, difflib

TOP = [
"Find the first equilibrium index of an array (left sum = right sum)",
"Find two numbers in an array that add up to a target sum (Two Sum)",
"Best time to buy and sell a stock with unlimited transactions",
"Reduce a string by repeatedly removing K consecutive identical characters",
"Find the longest substring without repeating characters",
"Reverse a linked list iteratively",
"Find a pair of numbers in an array that add up to a target (Two Sum)",
"Implement binary search iteratively on a sorted array",
"Search a target in a matrix that is sorted row-wise and column-wise",
"Understand and apply the Binary Search on Answer template",
"Koko eats bananas — find the minimum eating speed to finish within H hours",
"Find a pair in a sorted array that sums to a target value",
"Find the maximum of every window of size K in an array (Sliding Window Maximum)",
"Find the length of the longest subarray with a sum less than or equal to a given value",
"Find the maximum of every sliding window of size K using a deque",
"Find the Nth Fibonacci number using plain recursion",
"Find the Nth Fibonacci number using memoized recursion (top-down DP)",
"Search for a target in a matrix sorted row-wise and column-wise",
"Find the Nth Fibonacci number using memoization and tabulation",
"Find the Longest Common Subsequence between two strings",
]

HIGH = [
"Find the second largest element in an array",
"Left rotate an array by K positions",
"Move all zeroes in an array to the end (keep order of others)",
"Remove duplicates from a sorted array in place",
"Find the missing number from 1 to N in an array",
"Find the duplicate number in an array of 1 to N",
"Find all equilibrium indices in an array, not just the first",
"Find the equilibrium index when the array contains negative numbers",
"Find the equilibrium index using O(1) extra space (no prefix array)",
"Find all unique pairs in an array with a given sum",
"Find the majority element that appears more than n/2 times",
"Find the maximum sum of a contiguous subarray (Kadane's Algorithm)",
"Best time to buy and sell a stock (one transaction only)",
"Find a subarray with a given sum in an array of non-negative numbers",
"Find a subarray with a given sum when negatives are allowed",
"Find three numbers in an array that add up to zero (3Sum)",
"Find the second largest element without sorting the array",
"Check if a string is a palindrome",
"Find the first non-repeating character in a string",
"Check if two strings are anagrams of each other",
"Reduce a string by repeatedly removing pairs (K = 2) of identical characters",
"Reduce a string by repeatedly removing K consecutive identical characters",
"Reduce a string by repeatedly removing adjacent duplicate PAIRS only",
"Find the length of the longest substring with at most K distinct characters",
"Find the longest palindromic substring in a string",
"Count all palindromic substrings in a string",
"Find the smallest window in a string that contains all characters of another string",
"Insert a node at the beginning of a linked list",
"Find the middle node of a linked list in one pass",
"Detect a cycle in a linked list",
"Merge two sorted linked lists into one sorted list",
"Count the number of pairs in an array with a given sum",
"Find the majority element using a hash map",
"Find a subarray with a given sum using prefix sum + hashing",
"Find three numbers that sum to zero, verified with hashing",
"Check if two strings are anagrams using a frequency hash map",
"Implement binary search recursively on a sorted array",
"Find the search insert position of a target in a sorted array",
"Find the first occurrence of a target in a sorted array with duplicates",
"Find the last occurrence of a target in a sorted array with duplicates",
"Find the first and last position of a target together (one function)",
"Search for a target in a rotated sorted array",
"Compute the integer square root of a number using binary search",
"Find the minimum ship capacity to deliver all packages within D days",
"Find the smallest divisor of an array such that the sum stays ≤ a threshold",
"Implement Merge Sort and explain its divide-and-conquer steps",
"Remove duplicates from a sorted array using two pointers",
"Move all zeroes to the end of an array using two pointers",
"Find three numbers in an array that sum to zero (3Sum)",
"Find the maximum sum of any K consecutive elements (fixed window)",
"Find the smallest subarray with a sum greater than or equal to a target",
"Find the maximum number of vowels in any substring of length K (fixed window)",
"Find the smallest window in a string containing all characters of a pattern",
"Count the number of subarrays with sum exactly equal to K",
"Check for balanced / valid parentheses in an expression",
"Find the next greater element for every element in an array",
"Print a matrix in spiral order",
"Best time to buy and sell a stock (single transaction)",
"Climbing Stairs — count ways to reach the top taking 1 or 2 steps",
]

MEDIUM = [
"Find the sum and average of all elements in an array",
"Find the greatest (maximum) element in an array",
"Find the third largest element in an array",
"Find the second smallest element in an array",
"Reverse an array using extra space",
"Reverse an array in place without extra space",
"Left rotate an array by one position",
"Right rotate an array by K positions",
"Move all negative numbers to the end (keep order of others)",
"Find the frequency of every element in an array",
"Return the equilibrium value (not the index) at the balance point",
"Find the intersection of two sorted arrays",
"Find the intersection of two unsorted arrays using hashing",
"Sort an array of only 0s, 1s and 2s (Dutch National Flag)",
"Find all elements that appear more than n/3 times",
"Print the actual subarray with the maximum sum, not just the sum",
"Find the container that holds the most water (Container With Most Water)",
"Find the leader elements of an array (greater than all elements to its right)",
"Find the minimum number of platforms needed given arrival/departure times",
"Merge two sorted arrays in place without extra space",
"Find the second largest element allowing duplicates",
]

def norm(s):
    s = s.lower()
    s = s.replace('—','-').replace('’',"'")
    s = re.sub(r'[^a-z0-9 ]',' ', s)
    s = re.sub(r'\s+',' ', s).strip()
    return s

data = json.load(open('lib/placementQuestions.json'))
by_norm = {}
for q in data:
    by_norm.setdefault(norm(q['title']), []).append(q)

def match(title, tier, used_ids, unmatched):
    n = norm(title)
    cands = by_norm.get(n)
    if cands:
        for c in cands:
            if c['id'] not in used_ids:
                used_ids.add(c['id']); c['_priority']=tier; return True
    # fuzzy fallback
    best=None; best_score=0
    for q in data:
        if q['id'] in used_ids: continue
        score = difflib.SequenceMatcher(None, n, norm(q['title'])).ratio()
        if score>best_score:
            best_score=score; best=q
    if best and best_score>0.72:
        used_ids.add(best['id']); best['_priority']=tier
        return True
    unmatched.append((tier,title,best['title'] if best else None, round(best_score,2)))
    return False

used=set(); unmatched=[]
for t in TOP: match(t,'TOP PRIORITY',used,unmatched)
for t in HIGH: match(t,'HIGH',used,unmatched)
for t in MEDIUM: match(t,'MEDIUM',used,unmatched)

for q in data:
    if '_priority' not in q:
        q['priority']='Unranked'
    else:
        q['priority']=q.pop('_priority')

print('matched:', len(used), '/', len(TOP)+len(HIGH)+len(MEDIUM))
print('unmatched:')
for u in unmatched: print(u)

with open('lib/placementQuestions.json','w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
