#!/bin/bash

# Kaizen Domain Coach Script
# Audits the codebase for Lullabook rules, glossary terms, build status, and organization.

# ANSI Color Codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}          Running Kaizen Domain Coach               ${NC}"
echo -e "${BLUE}====================================================${NC}"

# Variables to collect results
GLOSSARY_VIOLATIONS=""
ORGANIZATION_VIOLATIONS=""
ARCH_VIOLATIONS=""
TESTS_STATUS="UNKNOWN"
BUILD_STATUS="UNKNOWN"
SECRETS_STATUS="PASSED"

# 1. Check Glossary Violations
echo -e "\n${BLUE}[1/5] Checking Glossary Terms...${NC}"

# Check for "Parent Persona"
PARENT_PERSONA_MATCHES=$(grep -rni "parent persona" src/ tests/ 2>/dev/null)
if [ ! -z "$PARENT_PERSONA_MATCHES" ]; then
    GLOSSARY_VIOLATIONS="${GLOSSARY_VIOLATIONS}\n- **'Parent Persona' used:** Replace with 'Adult Persona'. Found in:\n\`\`\`\n${PARENT_PERSONA_MATCHES}\n\`\`\`"
fi

# Check for "soft delete" or "soft-delete"
SOFT_DELETE_MATCHES=$(grep -rni "soft[- ]delete" src/ tests/ 2>/dev/null)
if [ ! -z "$SOFT_DELETE_MATCHES" ]; then
    GLOSSARY_VIOLATIONS="${GLOSSARY_VIOLATIONS}\n- **'Soft-delete' used:** Replace with 'Hard-delete'. Found in:\n\`\`\`\n${SOFT_DELETE_MATCHES}\n\`\`\`"
fi

# Check for "country" in domain/types
COUNTRY_MATCHES=$(grep -rni "country" src/domain/ src/app/ src/services/ 2>/dev/null | grep -vi "countryCode")
if [ ! -z "$COUNTRY_MATCHES" ]; then
    GLOSSARY_VIOLATIONS="${GLOSSARY_VIOLATIONS}\n- **'Country' used:** Replace with 'Jurisdiction'. Found in:\n\`\`\`\n${COUNTRY_MATCHES}\n\`\`\`"
fi

# Check for "user" inside core domain logic (e.g. types.ts or services) where it should be Member or Guardian
USER_DOMAIN_MATCHES=$(grep -rn "interface User" src/ 2>/dev/null || grep -rn "type User =" src/ 2>/dev/null)
if [ ! -z "$USER_DOMAIN_MATCHES" ]; then
    GLOSSARY_VIOLATIONS="${GLOSSARY_VIOLATIONS}\n- **'User' used in domain definition:** Replace with 'Member' or 'Guardian'. Found in:\n\`\`\`\n${USER_DOMAIN_MATCHES}\n\`\`\`"
fi

if [ -z "$GLOSSARY_VIOLATIONS" ]; then
    echo -e "${GREEN}✔ Glossary check passed! No incorrect terms found.${NC}"
else
    echo -e "${RED}✘ Glossary check failed! Found violations.${NC}"
fi


# 2. Check Documentation Organization
echo -e "\n${BLUE}[2/5] Checking Documentation Organization...${NC}"

FREE_FLOATING_DOCS=$(find CONTEXT -maxdepth 1 -name "*.md" ! -name "CONTEXT.md" ! -name "HANDOFF.md")
if [ ! -z "$FREE_FLOATING_DOCS" ]; then
    ORGANIZATION_VIOLATIONS="- **Free-floating markdown files in CONTEXT/:** Move them to designated subfolders (e.g. \`CONTEXT/handoffs/\`, \`CONTEXT/planning/\`, etc.):\n\`\`\`\n${FREE_FLOATING_DOCS}\n\`\`\`"
fi

if [ -z "$ORGANIZATION_VIOLATIONS" ]; then
    echo -e "${GREEN}✔ Documentation is correctly organized into category folders.${NC}"
else
    echo -e "${RED}✘ Documentation organization violations found.${NC}"
fi


# 3. Check Architecture & Secrets
echo -e "\n${BLUE}[3/5] Checking Architecture & Secrets...${NC}"

# Check that RLS is mentioned in supabase migrations
RLS_ENABLED=$(grep -ri "ROW LEVEL SECURITY" supabase/ 2>/dev/null)
if [ -z "$RLS_ENABLED" ]; then
    ARCH_VIOLATIONS="${ARCH_VIOLATIONS}\n- **Row-Level Security (RLS) check:** No active RLS enable statements found in \`supabase/\` schema files."
fi

# Check .env gitignore status
GITIGNORE_ENV=$(grep -x "\.env" .gitignore 2>/dev/null || grep -x "\.env\..*" .gitignore 2>/dev/null)
if [ -z "$GITIGNORE_ENV" ]; then
    SECRETS_STATUS="FAILED"
    ARCH_VIOLATIONS="${ARCH_VIOLATIONS}\n- **Secrets protection:** \`.env\` file is not ignored in \`.gitignore\`!"
fi

if [ -z "$ARCH_VIOLATIONS" ] && [ "$SECRETS_STATUS" == "PASSED" ]; then
    echo -e "${GREEN}✔ Architecture & Secrets check passed.${NC}"
else
    echo -e "${RED}✘ Architecture/Secrets violations found.${NC}"
fi


# 4. Run Test Suite
echo -e "\n${BLUE}[4/5] Running Tests...${NC}"
npm test -- --run > /tmp/npm_test_output.log 2>&1
if [ $? -eq 0 ]; then
    TESTS_STATUS="PASSED"
    echo -e "${GREEN}✔ All tests passed!${NC}"
else
    TESTS_STATUS="FAILED"
    echo -e "${RED}✘ Tests failed! Check /tmp/npm_test_output.log for details.${NC}"
fi


# 5. Run Build
echo -e "\n${BLUE}[5/5] Running Build...${NC}"
npm run build > /tmp/npm_build_output.log 2>&1
if [ $? -eq 0 ]; then
    BUILD_STATUS="PASSED"
    echo -e "${GREEN}✔ Build passed!${NC}"
else
    BUILD_STATUS="FAILED"
    echo -e "${RED}✘ Build failed! Check /tmp/npm_build_output.log for details.${NC}"
fi

# Calculate score
SCORE=10
[ ! -z "$GLOSSARY_VIOLATIONS" ] && SCORE=$((SCORE-2))
[ ! -z "$ORGANIZATION_VIOLATIONS" ] && SCORE=$((SCORE-2))
[ ! -z "$ARCH_VIOLATIONS" ] && SCORE=$((SCORE-2))
[ "$TESTS_STATUS" == "FAILED" ] && SCORE=$((SCORE-2))
[ "$BUILD_STATUS" == "FAILED" ] && SCORE=$((SCORE-2))

# Write KAIZEN-REVIEW-BRIEF.md
echo -e "\n${BLUE}Generating KAIZEN-REVIEW-BRIEF.md...${NC}"

cat << EOF > KAIZEN-REVIEW-BRIEF.md
# Kaizen Review Brief — Lullabook

**Date:** $(date "+%Y-%m-%d %H:%M:%S")  
**Coach Score:** ${SCORE}/10  

---

## Overall Assessment
$(if [ $SCORE -eq 10 ]; then echo "Excellent! The codebase strictly complies with the glossary, architectural patterns, organization rules, and has a clean test suite and build."; else echo "Audit completed with some suggestions/violations below. Please review and apply the fixes."; fi)

## Status Check
- **Unit/Integration Tests:** ${TESTS_STATUS}
- **Production Build:** ${BUILD_STATUS}
- **Secret Leaks (.env ignored):** ${SECRETS_STATUS}

---

$(if [ ! -z "$GLOSSARY_VIOLATIONS" ]; then
echo -e "## Glossary Compliance Violations\n${GLOSSARY_VIOLATIONS}\n"
fi)

$(if [ ! -z "$ORGANIZATION_VIOLATIONS" ]; then
echo -e "## Document Organization Violations\n${ORGANIZATION_VIOLATIONS}\n"
fi)

$(if [ ! -z "$ARCH_VIOLATIONS" ]; then
echo -e "## Architecture Violations\n${ARCH_VIOLATIONS}\n"
fi)

$(if [ $SCORE -eq 10 ]; then
echo -e "## Status: Clean\nNo current violations. Keep up the high standards!\n"
fi)
EOF

echo -e "${GREEN}✔ KAIZEN-REVIEW-BRIEF.md successfully generated!${NC}"
echo -e "${BLUE}====================================================${NC}"
